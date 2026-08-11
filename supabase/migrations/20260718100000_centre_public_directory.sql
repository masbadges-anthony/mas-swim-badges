-- 20260718100000_centre_public_directory.sql
--
-- Extend partner_centers to support:
--   1. Classification of what the centre does (teach / assess / both)
--   2. Publication toggle for the public "Find a swim centre" directory
--   3. Structured public contact info + operating hours + address
--   4. Photo gallery (max 5, first is hero)
--   5. Fit-for-assessment criteria (pool spec, safety items, certification)
--
-- Plus:
--   • centre-photos storage bucket (public read, FO/sysadmin write)
--   • list_published_centres()  anon-callable — feeds the public website
--   • list_centres_admin()      staff view for the admin page
--   • centre_upsert_public_fields()  single write path for the new fields

-- ---------- schema additions ----------
alter table public.partner_centers
  -- Classification: what the centre is recognised for.
  add column if not exists can_teach   boolean not null default false,
  add column if not exists can_assess  boolean not null default false,

  -- Publication toggle. Independent of capability — a capable centre may
  -- still be off the public directory if photos or details aren't ready.
  add column if not exists publish_to_public_site boolean not null default false,

  -- Structured address (in addition to legacy address text column).
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city          text,
  add column if not exists postcode      text,
  add column if not exists google_maps_url text,

  -- Public-facing contact (may differ from the internal principal contact).
  add column if not exists public_contact_email text,
  add column if not exists public_contact_phone text,
  add column if not exists contact_public       boolean not null default true,

  -- Operating hours (free text; renders as-is on the public site).
  add column if not exists operating_hours_text text,

  -- Short public description (2-3 sentences).
  add column if not exists public_blurb text
    check (public_blurb is null or char_length(public_blurb) <= 500),

  -- Photo gallery: array of storage object paths in the centre-photos bucket.
  -- First path is the hero image. Maximum 5 enforced by application code
  -- and a CHECK constraint here as belt-and-braces.
  add column if not exists image_paths text[] not null default '{}',

  -- Fit-for-assessment criteria.
  add column if not exists pool_length_m         numeric(5,2),
  add column if not exists pool_min_depth_m      numeric(5,2),
  add column if not exists pool_max_depth_m      numeric(5,2),
  add column if not exists pool_lane_count       integer,
  add column if not exists pool_certified        boolean not null default false,
  add column if not exists pool_certifier        text,
  add column if not exists has_lifeguard_on_duty boolean not null default false,
  add column if not exists has_eap               boolean not null default false,
  add column if not exists has_first_aid_aed     boolean not null default false,
  add column if not exists has_adequate_deck     boolean not null default false;

alter table public.partner_centers
  drop constraint if exists partner_centers_image_paths_len_chk;
alter table public.partner_centers
  add constraint partner_centers_image_paths_len_chk
  check (array_length(image_paths, 1) is null or array_length(image_paths, 1) <= 5);

create index if not exists partner_centers_publish_idx
  on public.partner_centers (publish_to_public_site) where publish_to_public_site;

-- ---------- centre-photos bucket ----------
insert into storage.buckets (id, name, public)
values ('centre-photos', 'centre-photos', true)
on conflict (id) do nothing;

drop policy if exists centre_photos_read   on storage.objects;
drop policy if exists centre_photos_insert on storage.objects;
drop policy if exists centre_photos_update on storage.objects;
drop policy if exists centre_photos_delete on storage.objects;

create policy centre_photos_read on storage.objects
  for select
  using (bucket_id = 'centre-photos');

create policy centre_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'centre-photos'
              and (public.has_role('system_admin') or public.has_role('finance_officer')));

create policy centre_photos_update on storage.objects
  for update to authenticated
  using       (bucket_id = 'centre-photos'
              and (public.has_role('system_admin') or public.has_role('finance_officer')))
  with check  (bucket_id = 'centre-photos'
              and (public.has_role('system_admin') or public.has_role('finance_officer')));

create policy centre_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'centre-photos'
         and (public.has_role('system_admin') or public.has_role('finance_officer')));

-- ---------- ANON-callable public directory ----------
-- Returns only centres flagged publish_to_public_site AND status = 'recognized'.
-- The website reads this without authenticating.
create or replace function public.list_published_centres()
returns table (
  id                    uuid,
  name                  text,
  state                 public.my_state,
  can_teach             boolean,
  can_assess            boolean,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  google_maps_url       text,
  public_contact_email  text,
  public_contact_phone  text,
  contact_public        boolean,
  operating_hours_text  text,
  public_blurb          text,
  image_paths           text[]
)
language sql stable security definer set search_path to ''
as $$
  select
    c.id, c.name, c.state, c.can_teach, c.can_assess,
    c.address_line1, c.address_line2, c.city, c.postcode, c.google_maps_url,
    case when c.contact_public then c.public_contact_email else null end,
    case when c.contact_public then c.public_contact_phone else null end,
    c.contact_public,
    c.operating_hours_text, c.public_blurb, c.image_paths
  from public.partner_centers c
  where c.publish_to_public_site
    and c.status = 'recognized'
  order by c.state, c.name;
$$;
grant execute on function public.list_published_centres() to anon, authenticated;

-- ---------- Staff-side full view ----------
create or replace function public.list_centres_admin()
returns table (
  id                    uuid,
  name                  text,
  state                 public.my_state,
  status                text,
  can_teach             boolean,
  can_assess            boolean,
  publish_to_public_site boolean,
  address               text,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  google_maps_url       text,
  contact_email         text,
  contact_phone         text,
  public_contact_email  text,
  public_contact_phone  text,
  contact_public        boolean,
  operating_hours_text  text,
  public_blurb          text,
  image_paths           text[],
  pool_length_m         numeric,
  pool_min_depth_m      numeric,
  pool_max_depth_m      numeric,
  pool_lane_count       integer,
  pool_certified        boolean,
  pool_certifier        text,
  has_lifeguard_on_duty boolean,
  has_eap               boolean,
  has_first_aid_aed     boolean,
  has_adequate_deck     boolean,
  recognized_at         date,
  valid_until           date
)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not (public.has_role('system_admin')
       or public.has_role('finance_officer')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')) then
    raise exception 'Not authorised.';
  end if;
  return query
    select
      c.id, c.name, c.state, c.status::text,
      c.can_teach, c.can_assess, c.publish_to_public_site,
      c.address, c.address_line1, c.address_line2, c.city, c.postcode, c.google_maps_url,
      c.contact_email, c.contact_phone,
      c.public_contact_email, c.public_contact_phone, c.contact_public,
      c.operating_hours_text, c.public_blurb, c.image_paths,
      c.pool_length_m, c.pool_min_depth_m, c.pool_max_depth_m, c.pool_lane_count,
      c.pool_certified, c.pool_certifier,
      c.has_lifeguard_on_duty, c.has_eap, c.has_first_aid_aed, c.has_adequate_deck,
      c.recognized_at, c.valid_until
    from public.partner_centers c
    order by c.state, c.name;
end;
$$;
grant execute on function public.list_centres_admin() to authenticated;

-- ---------- One write path for the new fields ----------
-- FO / sysadmin only. Never touches capability flags (can_teach / can_assess);
-- those and status changes go through the existing recognition workflow.
create or replace function public.centre_upsert_public_fields(
  _id                     uuid,
  _address_line1          text,
  _address_line2          text,
  _city                   text,
  _postcode               text,
  _google_maps_url        text,
  _public_contact_email   text,
  _public_contact_phone   text,
  _contact_public         boolean,
  _operating_hours_text   text,
  _public_blurb           text,
  _image_paths            text[],
  _publish_to_public_site boolean,
  _pool_length_m          numeric,
  _pool_min_depth_m       numeric,
  _pool_max_depth_m       numeric,
  _pool_lane_count        integer,
  _pool_certified         boolean,
  _pool_certifier         text,
  _has_lifeguard_on_duty  boolean,
  _has_eap                boolean,
  _has_first_aid_aed      boolean,
  _has_adequate_deck      boolean
)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not (public.has_role('system_admin') or public.has_role('finance_officer')) then
    raise exception 'Not authorised: FO or sysadmin only.';
  end if;

  if _image_paths is not null and array_length(_image_paths, 1) > 5 then
    raise exception 'Maximum 5 images per centre.';
  end if;

  update public.partner_centers set
    address_line1         = _address_line1,
    address_line2         = _address_line2,
    city                  = _city,
    postcode              = _postcode,
    google_maps_url       = _google_maps_url,
    public_contact_email  = _public_contact_email,
    public_contact_phone  = _public_contact_phone,
    contact_public        = coalesce(_contact_public, true),
    operating_hours_text  = _operating_hours_text,
    public_blurb          = _public_blurb,
    image_paths           = coalesce(_image_paths, '{}'::text[]),
    publish_to_public_site= coalesce(_publish_to_public_site, false),
    pool_length_m         = _pool_length_m,
    pool_min_depth_m      = _pool_min_depth_m,
    pool_max_depth_m      = _pool_max_depth_m,
    pool_lane_count       = _pool_lane_count,
    pool_certified        = coalesce(_pool_certified, false),
    pool_certifier        = _pool_certifier,
    has_lifeguard_on_duty = coalesce(_has_lifeguard_on_duty, false),
    has_eap               = coalesce(_has_eap, false),
    has_first_aid_aed     = coalesce(_has_first_aid_aed, false),
    has_adequate_deck     = coalesce(_has_adequate_deck, false),
    updated_at            = now()
  where id = _id;

  if not found then
    raise exception 'Centre not found.';
  end if;
end;
$$;
grant execute on function public.centre_upsert_public_fields(
  uuid, text, text, text, text, text, text, text, boolean, text, text,
  text[], boolean, numeric, numeric, numeric, integer, boolean, text,
  boolean, boolean, boolean, boolean
) to authenticated;

-- ---------- Capability toggles (separate write path) ----------
-- can_teach / can_assess are governance-level determinations. Sysadmin +
-- chairperson + chief_examiner may set them; FO cannot (FO handles the
-- public-facing fields but not what the centre is qualified to do).
create or replace function public.centre_set_capabilities(
  _id         uuid,
  _can_teach  boolean,
  _can_assess boolean
)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not (public.has_role('system_admin')
       or public.has_role('chairperson')
       or public.has_role('chief_examiner')) then
    raise exception 'Not authorised: capability changes require sysadmin, chairperson, or chief examiner.';
  end if;
  update public.partner_centers
     set can_teach = coalesce(_can_teach, false),
         can_assess = coalesce(_can_assess, false),
         updated_at = now()
   where id = _id;
  if not found then raise exception 'Centre not found.'; end if;
end;
$$;
grant execute on function public.centre_set_capabilities(uuid, boolean, boolean) to authenticated;
