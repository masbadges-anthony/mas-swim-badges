-- 20260722100000_website_module_guides_and_images.sql
--
-- Adds admin-managed structure for the /guides section of the public site
-- (previously hardcoded in src/data/guides.ts). Sysadmin can create, edit,
-- reorder, and delete guide "cards" (per-audience narratives shown as tiles
-- on /guides). Each card supports two image slots with captions; the public
-- site renders images only when a URL is present (zero-footprint when empty).
--
-- Storage: uses Supabase Storage bucket `website-images` (public read,
-- sysadmin write). Bucket creation is idempotent; upload path is handled
-- via the Storage API (this migration only creates the bucket + policies).
--
-- Structure:
--   guide_cards       — the tiles on /guides (title, audience, summary, accent)
--   guide_sections    — a card's body sections (heading + body/steps/points/note)
--   Both carry optional image_url, image_caption for two slots each.
--
-- The existing hardcoded content in src/data/guides.ts is seeded into these
-- tables so nothing goes missing on cut-over.

-- ============================================================================
-- 1 · Storage bucket
-- ============================================================================
-- Create a public-read bucket for website images. Supabase Storage buckets
-- are managed in the storage schema.
insert into storage.buckets (id, name, public)
  values ('website-images', 'website-images', true)
on conflict (id) do nothing;

-- Storage policies: public read, sysadmin write.
drop policy if exists website_images_public_read on storage.objects;
create policy website_images_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'website-images');

drop policy if exists website_images_admin_insert on storage.objects;
create policy website_images_admin_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'website-images' and public.has_role('system_admin'));

drop policy if exists website_images_admin_update on storage.objects;
create policy website_images_admin_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'website-images' and public.has_role('system_admin'))
  with check (bucket_id = 'website-images' and public.has_role('system_admin'));

drop policy if exists website_images_admin_delete on storage.objects;
create policy website_images_admin_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'website-images' and public.has_role('system_admin'));

-- ============================================================================
-- 2 · Guide cards
-- ============================================================================
create table if not exists public.guide_cards (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  audience       text not null,
  accent         text not null default '#09B3CA',   -- hex accent colour
  summary        text not null default '',
  sort_order     integer not null default 0,
  is_published   boolean not null default true,

  -- Two optional image slots. NULL = slot invisible on the public page.
  image1_url     text,
  image1_caption text,
  image2_url     text,
  image2_caption text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);

comment on table  public.guide_cards is 'Cards shown on /guides (audience-specific narratives). Sysadmin CRUD via admin_* RPCs. Public reads via list_public_guides().';
comment on column public.guide_cards.slug is 'Stable URL segment (/guides/:slug). Not editable after creation unless carefully migrated.';
comment on column public.guide_cards.image1_url is 'Optional. When NULL the image slot is not rendered (zero footprint).';
comment on column public.guide_cards.image2_url is 'Optional. When NULL the image slot is not rendered (zero footprint).';

drop trigger if exists trg_guide_cards_updated_at on public.guide_cards;
create trigger trg_guide_cards_updated_at
  before update on public.guide_cards
  for each row execute function public.handle_updated_at();

create index if not exists idx_guide_cards_sort on public.guide_cards (sort_order, id);

alter table public.guide_cards enable row level security;

drop policy if exists guide_cards_public_read on public.guide_cards;
create policy guide_cards_public_read
  on public.guide_cards for select to anon, authenticated
  using (is_published = true);

drop policy if exists guide_cards_admin_all on public.guide_cards;
create policy guide_cards_admin_all
  on public.guide_cards for all to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

-- ============================================================================
-- 3 · Guide sections
-- ============================================================================
-- A card is a list of sections, each with heading + one of: body / steps /
-- points / note. Steps and points are stored as jsonb arrays.
create table if not exists public.guide_sections (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.guide_cards(id) on delete cascade,
  heading        text not null,
  body           text,
  steps          jsonb,       -- optional array of strings
  points         jsonb,       -- optional array of strings
  note           text,        -- callout text

  -- Two optional image slots per section.
  image1_url     text,
  image1_caption text,
  image2_url     text,
  image2_caption text,

  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);

comment on table public.guide_sections is 'Ordered sections within a guide card.';

drop trigger if exists trg_guide_sections_updated_at on public.guide_sections;
create trigger trg_guide_sections_updated_at
  before update on public.guide_sections
  for each row execute function public.handle_updated_at();

create index if not exists idx_guide_sections_card_sort on public.guide_sections (card_id, sort_order);

alter table public.guide_sections enable row level security;

drop policy if exists guide_sections_public_read on public.guide_sections;
create policy guide_sections_public_read
  on public.guide_sections for select to anon, authenticated
  using (exists (select 1 from public.guide_cards c where c.id = card_id and c.is_published));

drop policy if exists guide_sections_admin_all on public.guide_sections;
create policy guide_sections_admin_all
  on public.guide_sections for all to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

-- ============================================================================
-- 4 · Public read surface — one call returns everything /guides needs
-- ============================================================================
create or replace function public.list_public_guides()
returns jsonb
language sql stable
set search_path to ''
as $$
  select coalesce(jsonb_agg(card order by card->>'sort_order', card->>'slug'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',             c.id,
      'slug',           c.slug,
      'title',          c.title,
      'audience',       c.audience,
      'accent',         c.accent,
      'summary',        c.summary,
      'sort_order',     c.sort_order,
      'image1_url',     c.image1_url,
      'image1_caption', c.image1_caption,
      'image2_url',     c.image2_url,
      'image2_caption', c.image2_caption,
      'sections', coalesce(
        (select jsonb_agg(s_row order by (s_row->>'sort_order')::int, s_row->>'heading')
           from (
             select jsonb_build_object(
               'id',             s.id,
               'heading',        s.heading,
               'body',           s.body,
               'steps',          s.steps,
               'points',         s.points,
               'note',           s.note,
               'image1_url',     s.image1_url,
               'image1_caption', s.image1_caption,
               'image2_url',     s.image2_url,
               'image2_caption', s.image2_caption,
               'sort_order',     s.sort_order
             ) as s_row
             from public.guide_sections s
             where s.card_id = c.id
           ) sect),
        '[]'::jsonb
      )
    ) as card
    from public.guide_cards c
    where c.is_published = true
  ) sub;
$$;

grant execute on function public.list_public_guides() to anon, authenticated;

-- Admin variant — includes unpublished, ordered by sort_order.
create or replace function public.admin_list_guides()
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare result jsonb;
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may manage the website content.';
  end if;

  select coalesce(jsonb_agg(card order by (card->>'sort_order')::int), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id',             c.id,
      'slug',           c.slug,
      'title',          c.title,
      'audience',       c.audience,
      'accent',         c.accent,
      'summary',        c.summary,
      'sort_order',     c.sort_order,
      'is_published',   c.is_published,
      'image1_url',     c.image1_url,
      'image1_caption', c.image1_caption,
      'image2_url',     c.image2_url,
      'image2_caption', c.image2_caption,
      'updated_at',     c.updated_at,
      'sections', coalesce(
        (select jsonb_agg(s_row order by (s_row->>'sort_order')::int)
           from (
             select jsonb_build_object(
               'id',             s.id,
               'heading',        s.heading,
               'body',           s.body,
               'steps',          s.steps,
               'points',         s.points,
               'note',           s.note,
               'image1_url',     s.image1_url,
               'image1_caption', s.image1_caption,
               'image2_url',     s.image2_url,
               'image2_caption', s.image2_caption,
               'sort_order',     s.sort_order
             ) as s_row
             from public.guide_sections s
             where s.card_id = c.id
           ) sect),
        '[]'::jsonb
      )
    ) as card
    from public.guide_cards c
  ) sub;

  return result;
end;
$$;

grant execute on function public.admin_list_guides() to authenticated;

-- ============================================================================
-- 5 · Card CRUD RPCs (sysadmin only)
-- ============================================================================
create or replace function public.admin_upsert_guide_card(
  _id             uuid,           -- null = create; non-null = update
  _slug           text,
  _title          text,
  _audience       text,
  _accent         text,
  _summary        text,
  _is_published   boolean,
  _image1_url     text,
  _image1_caption text,
  _image2_url     text,
  _image2_caption text
)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare _next_sort int;
        _card_id   uuid;
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may edit guide cards.';
  end if;
  if length(coalesce(trim(_slug), '')) = 0 then
    raise exception 'Slug is required.';
  end if;
  if length(coalesce(trim(_title), '')) = 0 then
    raise exception 'Title is required.';
  end if;

  if _id is null then
    select coalesce(max(sort_order), -1) + 1 into _next_sort from public.guide_cards;
    insert into public.guide_cards (
      slug, title, audience, accent, summary, sort_order, is_published,
      image1_url, image1_caption, image2_url, image2_caption, updated_by
    ) values (
      trim(_slug), _title, coalesce(_audience, ''),
      coalesce(_accent, '#09B3CA'), coalesce(_summary, ''),
      _next_sort, coalesce(_is_published, true),
      nullif(trim(coalesce(_image1_url, '')), ''), nullif(trim(coalesce(_image1_caption, '')), ''),
      nullif(trim(coalesce(_image2_url, '')), ''), nullif(trim(coalesce(_image2_caption, '')), ''),
      (select auth.uid())
    ) returning id into _card_id;
    return _card_id;
  else
    update public.guide_cards set
      slug           = trim(_slug),
      title          = _title,
      audience       = coalesce(_audience, ''),
      accent         = coalesce(_accent, '#09B3CA'),
      summary        = coalesce(_summary, ''),
      is_published   = coalesce(_is_published, true),
      image1_url     = nullif(trim(coalesce(_image1_url, '')), ''),
      image1_caption = nullif(trim(coalesce(_image1_caption, '')), ''),
      image2_url     = nullif(trim(coalesce(_image2_url, '')), ''),
      image2_caption = nullif(trim(coalesce(_image2_caption, '')), ''),
      updated_by     = (select auth.uid())
    where id = _id;
    return _id;
  end if;
end;
$$;

grant execute on function public.admin_upsert_guide_card(uuid, text, text, text, text, text, boolean, text, text, text, text) to authenticated;

create or replace function public.admin_delete_guide_card(_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may delete guide cards.';
  end if;
  delete from public.guide_cards where id = _id;
end;
$$;
grant execute on function public.admin_delete_guide_card(uuid) to authenticated;

-- Reorder: takes an array of card ids in the new order.
create or replace function public.admin_reorder_guide_cards(_ids uuid[])
returns void
language plpgsql security definer
set search_path to ''
as $$
declare i int;
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may reorder guide cards.';
  end if;

  for i in 1 .. array_length(_ids, 1) loop
    update public.guide_cards
       set sort_order = i - 1,
           updated_by = (select auth.uid())
     where id = _ids[i];
  end loop;
end;
$$;
grant execute on function public.admin_reorder_guide_cards(uuid[]) to authenticated;

-- ============================================================================
-- 6 · Section CRUD RPCs
-- ============================================================================
create or replace function public.admin_upsert_guide_section(
  _id             uuid,
  _card_id        uuid,
  _heading        text,
  _body           text,
  _steps          jsonb,
  _points         jsonb,
  _note           text,
  _image1_url     text,
  _image1_caption text,
  _image2_url     text,
  _image2_caption text
)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare _next_sort int;
        _section_id uuid;
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may edit guide sections.';
  end if;
  if _card_id is null then
    raise exception 'card_id is required.';
  end if;
  if length(coalesce(trim(_heading), '')) = 0 then
    raise exception 'Section heading is required.';
  end if;

  if _id is null then
    select coalesce(max(sort_order), -1) + 1 into _next_sort
      from public.guide_sections where card_id = _card_id;
    insert into public.guide_sections (
      card_id, heading, body, steps, points, note, sort_order,
      image1_url, image1_caption, image2_url, image2_caption, updated_by
    ) values (
      _card_id, _heading,
      nullif(trim(coalesce(_body, '')), ''),
      _steps, _points,
      nullif(trim(coalesce(_note, '')), ''),
      _next_sort,
      nullif(trim(coalesce(_image1_url, '')), ''), nullif(trim(coalesce(_image1_caption, '')), ''),
      nullif(trim(coalesce(_image2_url, '')), ''), nullif(trim(coalesce(_image2_caption, '')), ''),
      (select auth.uid())
    ) returning id into _section_id;
    return _section_id;
  else
    update public.guide_sections set
      heading        = _heading,
      body           = nullif(trim(coalesce(_body, '')), ''),
      steps          = _steps,
      points         = _points,
      note           = nullif(trim(coalesce(_note, '')), ''),
      image1_url     = nullif(trim(coalesce(_image1_url, '')), ''),
      image1_caption = nullif(trim(coalesce(_image1_caption, '')), ''),
      image2_url     = nullif(trim(coalesce(_image2_url, '')), ''),
      image2_caption = nullif(trim(coalesce(_image2_caption, '')), ''),
      updated_by     = (select auth.uid())
    where id = _id;
    return _id;
  end if;
end;
$$;
grant execute on function public.admin_upsert_guide_section(uuid, uuid, text, text, jsonb, jsonb, text, text, text, text, text) to authenticated;

create or replace function public.admin_delete_guide_section(_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may delete guide sections.';
  end if;
  delete from public.guide_sections where id = _id;
end;
$$;
grant execute on function public.admin_delete_guide_section(uuid) to authenticated;

create or replace function public.admin_reorder_guide_sections(_card_id uuid, _ids uuid[])
returns void
language plpgsql security definer
set search_path to ''
as $$
declare i int;
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may reorder guide sections.';
  end if;

  for i in 1 .. array_length(_ids, 1) loop
    update public.guide_sections
       set sort_order = i - 1,
           updated_by = (select auth.uid())
     where id = _ids[i] and card_id = _card_id;
  end loop;
end;
$$;
grant execute on function public.admin_reorder_guide_sections(uuid, uuid[]) to authenticated;

-- ============================================================================
-- 7 · Seed existing hardcoded /guides content into the tables
-- ============================================================================
-- Idempotent: only inserts when the card slug doesn't already exist. This
-- covers the case where the migration is re-run.
--
-- Each card contains its sections as jsonb; a helper cursor walks the list.
-- Content mirrors src/data/guides.ts exactly.

do $$
declare
  seed jsonb := $seed$
    [
      {
        "slug": "how-it-works",
        "title": "How MAS BADGES works",
        "audience": "Everyone",
        "accent": "#09B3CA",
        "summary": "The whole system in one read — who teaches, who assesses, how a badge is earned, and why it can be trusted.",
        "sections": [
          {"heading": "A badge certifies the swimmer", "body": "A MAS Swim Badge certifies the swimmer against a single published standard — not whoever coached them. Seven levels run in order, Starfish through Dolphin, each assessed and certified individually so no fundamental skill is skipped."},
          {"heading": "The instructor is the core conduit", "body": "Everything starts with a MAS BADGES–certified instructor. The instructor teaches to the syllabus, registers each swimmer, judges readiness honestly, and books the assessment. A swimmer who isn’t registered by an instructor or centre cannot be assessed — there is no anonymous booking."},
          {"heading": "Centres provide the home", "body": "A partner centre is the venue and the umbrella, recognised by Malaysia Aquatics and listed publicly. A centre’s core undertaking is to deliver the syllabus, which is why it must keep at least one certified instructor on its roster at all times."},
          {"heading": "An independent examiner judges", "body": "The swimmer is assessed by an independent examiner — never their own teacher. This conflict-of-interest firewall is the integrity rule the whole programme rests on, and the portal enforces it in data: an examiner can only grade the candidates assigned to them."},
          {"heading": "A pass becomes a verifiable certificate", "body": "A Pass is recorded and a serialised certificate is issued; a shortfall is a Refer that names the gap to close. Certificates are publicly verifiable by serial — while never exposing a child’s identity."},
          {"heading": "Where each audience goes next",
           "points": ["Parents & swimmers → find a centre, then claim and view your child’s badges.",
                      "Instructors → get certified, then register and prepare swimmers.",
                      "Centres → appoint a certified instructor and apply for recognition.",
                      "Examiners → apply, certify, and be invited to assess by state."]}
        ]
      },
      {
        "slug": "instructor-pathway",
        "title": "Instructor pathway",
        "audience": "Instructors",
        "accent": "#26A59A",
        "summary": "How to become a BADGES-certified instructor and what the role involves — the heart of the programme.",
        "sections": [
          {"heading": "Why the instructor matters", "body": "Only a MAS BADGES–certified instructor can prepare swimmers and book assessments. The instructor is the accountable person behind every booking, and a centre can only operate by having one on its roster."},
          {"heading": "Getting certified",
           "steps": ["Apply in the portal with proof of your swimming-competency baseline, a valid lifesaving / First Aid certification, and a Good Standing declaration.",
                     "Pay the course registration fee.",
                     "Attend the full Instructor Foundation Course — classroom and poolside, including a hands-on portal module.",
                     "Pass the theory assessment and a practical teaching assessment judged by the Master Trainer.",
                     "On certification, you receive a portal invitation; sign up with that email and the instructor role is granted."]},
          {"heading": "What you do in the portal",
           "points": ["Register candidates — an unregistered swimmer cannot be assessed.",
                      "Issue the claim slip so a family can link to their child’s record.",
                      "Confirm readiness, candidate by candidate, against every criterion at the target level.",
                      "Book the assessment, at least a month ahead."]},
          {"heading": "Stay firewalled", "body": "You prepare and book; the assigned examiner — never you — judges your swimmers. Build genuine technique rather than drilling the assessment task, and put a swimmer forward only when truly ready. A Refer is a normal, useful outcome.",
           "note": "Not certified yet? You can still operate by partnering with a certified instructor or centre while you train — see the enrolment guide."}
        ]
      }
    ]
  $seed$::jsonb;
  card jsonb;
  section jsonb;
  new_card_id uuid;
  card_sort int := 0;
  section_sort int;
begin
  for card in select * from jsonb_array_elements(seed) loop
    -- Skip if this slug already exists
    if not exists (select 1 from public.guide_cards where slug = card->>'slug') then
      insert into public.guide_cards (
        slug, title, audience, accent, summary, sort_order, is_published
      ) values (
        card->>'slug', card->>'title', card->>'audience',
        card->>'accent', card->>'summary', card_sort, true
      ) returning id into new_card_id;

      section_sort := 0;
      for section in select * from jsonb_array_elements(card->'sections') loop
        insert into public.guide_sections (
          card_id, heading, body, steps, points, note, sort_order
        ) values (
          new_card_id,
          section->>'heading',
          section->>'body',
          case when section ? 'steps'  then section->'steps'  else null end,
          case when section ? 'points' then section->'points' else null end,
          section->>'note',
          section_sort
        );
        section_sort := section_sort + 1;
      end loop;
    end if;
    card_sort := card_sort + 1;
  end loop;
end $$;

-- End of migration.
