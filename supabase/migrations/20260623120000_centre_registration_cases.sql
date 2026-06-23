-- 20260623120000_centre_registration_cases.sql
--
-- Centre partnership model, corrected to the agreed pipeline:
--   • Centres are NO LONGER self-created. The self-serve applicant-insert policy
--     is dropped; a centre is created only by a certified (centre-appointed)
--     instructor via register_centre(), or by admin.
--   • register_centre() creates a PENDING centre, attaches the calling instructor
--     as its centre-appointed instructor (a centre-scoped instructor membership),
--     and opens a partner_applications CASE for the Chairperson.
--   • The Chairperson/board acknowledge (-> pending) and decide (approve/deny).
--     Approval records the decision only; recognition + public listing stay gated
--     behind billing + verified payment (Step 9). Denied centres are removed and
--     have no effect on future applications.
--   • Coverage flag: a centre is flagged the moment its active instructor count
--     hits zero (instructor leaves / suspended / re-affiliates elsewhere).
--
-- ACTORS kept distinct:
--   centre (record) · centre-appointed-instructor (membership) ·
--   centre point-of-communication (poc_* on the application; becomes the centre
--   admin account post-approval in Step 9) · approving authority (Chairperson).
--
-- ASSUMPTIONS: partner_center_status = pending|recognized|suspended|removed;
-- state is my_state; principal_profile_id may be NOT NULL so it is bootstrapped
-- to the registering instructor and transfers to the POC account in Step 9.

-- 1. No more self-serve centre creation.
drop policy if exists partner_centers_insert_applicant on public.partner_centers;

-- 2. Coverage flag column.
alter table public.partner_centers
  add column if not exists flagged_no_instructor_at timestamptz;

-- 3. The approval case.
create type public.partner_application_status as enum
  ('submitted', 'pending', 'approved', 'denied', 'archived');

create table public.partner_applications (
  id                      uuid primary key default gen_random_uuid(),
  partner_center_id       uuid not null references public.partner_centers(id),
  submitted_by_profile_id uuid not null references public.profiles(id),  -- appointed instructor
  poc_name                text,
  poc_email               text not null,   -- invite target after approval (Step 9)
  poc_phone               text,
  status                  public.partner_application_status not null default 'submitted',
  decided_by_profile_id   uuid references public.profiles(id),
  decided_at              timestamptz,
  decision_note           text,
  enquiry_id              uuid references public.enquiries(id),
  created_at              timestamptz not null default now()
);
alter table public.partner_applications enable row level security;
-- No permissive policies: access via the definer functions below.

-- 4. Coverage recompute + trigger.
create or replace function public.refresh_centre_coverage(_centre uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.partner_centers pc
     set flagged_no_instructor_at = case
       when pc.status in ('pending', 'recognized')
        and (select count(*) from public.memberships m
              where m.role = 'instructor'
                and m.partner_center_id = _centre
                and m.status = 'active'
                and (m.expires_at is null or m.expires_at >= current_date)) = 0
       then coalesce(pc.flagged_no_instructor_at, now())
       else null
     end
   where pc.id = _centre;
$$;

create or replace function public.tg_membership_coverage()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.role = 'instructor' and OLD.partner_center_id is not null then
      perform public.refresh_centre_coverage(OLD.partner_center_id);
    end if;
    return OLD;
  end if;

  if NEW.role = 'instructor' and NEW.partner_center_id is not null then
    perform public.refresh_centre_coverage(NEW.partner_center_id);
  end if;
  if TG_OP = 'UPDATE' and OLD.role = 'instructor' and OLD.partner_center_id is not null
     and OLD.partner_center_id is distinct from NEW.partner_center_id then
    perform public.refresh_centre_coverage(OLD.partner_center_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists membership_coverage on public.memberships;
create trigger membership_coverage
  after insert or update or delete on public.memberships
  for each row execute function public.tg_membership_coverage();

-- 5. Instructor registers a centre.
create or replace function public.register_centre(
  _name       text,
  _state      public.my_state,
  _poc_email  text,
  _poc_name   text default null,
  _poc_phone  text default null,
  _address    text default null,
  _enquiry_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare _centre uuid; _app uuid;
begin
  if not public.has_role('instructor') then
    raise exception 'Only a MAS Badges-certified instructor can register a centre.';
  end if;
  if length(coalesce(_name, '')) < 2 or position('@' in coalesce(_poc_email, '')) = 0 then
    raise exception 'A centre name and a valid point-of-communication email are required.';
  end if;

  insert into public.partner_centers(
    name, state, contact_email, contact_phone, address, principal_profile_id, status
  ) values (
    trim(_name), _state, lower(trim(_poc_email)),
    nullif(trim(coalesce(_poc_phone, '')), ''),
    nullif(trim(coalesce(_address, '')), ''),
    auth.uid(),         -- bootstrap principal = registering instructor; transfers to POC in Step 9
    'pending'
  ) returning id into _centre;

  -- Attach the registering instructor as the centre-appointed instructor.
  begin
    insert into public.memberships(profile_id, role, partner_center_id, status)
    values (auth.uid(), 'instructor', _centre, 'active');
  exception when others then
    null;  -- tolerate any existing/unique membership setup; coverage recomputed below
  end;

  insert into public.partner_applications(
    partner_center_id, submitted_by_profile_id, poc_name, poc_email, poc_phone, status, enquiry_id
  ) values (
    _centre, auth.uid(),
    nullif(trim(coalesce(_poc_name, '')), ''),
    lower(trim(_poc_email)),
    nullif(trim(coalesce(_poc_phone, '')), ''),
    'submitted', _enquiry_id
  ) returning id into _app;

  perform public.refresh_centre_coverage(_centre);
  return _app;
end;
$$;

grant execute on function public.register_centre(text, public.my_state, text, text, text, text, uuid) to authenticated;

-- 6. Chairperson/board: acknowledge + decide.
create or replace function public.acknowledge_partner_application(_app_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')) then
    raise exception 'Only the Chairperson or a board member can action centre applications.';
  end if;
  update public.partner_applications
     set status = 'pending'
   where id = _app_id and status = 'submitted';
end;
$$;
grant execute on function public.acknowledge_partner_application(uuid) to authenticated;

create or replace function public.decide_partner_application(
  _app_id uuid, _approve boolean, _note text default null
) returns void
language plpgsql security definer set search_path to ''
as $$
declare _centre uuid;
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')) then
    raise exception 'Only the Chairperson or a board member can decide centre applications.';
  end if;
  select partner_center_id into _centre from public.partner_applications where id = _app_id;
  if not found then raise exception 'Application not found.'; end if;

  update public.partner_applications
     set status = case when _approve then 'approved' else 'denied' end,
         decided_by_profile_id = auth.uid(),
         decided_at = now(),
         decision_note = nullif(trim(coalesce(_note, '')), '')
   where id = _app_id;

  -- Denied: remove the pending centre (no effect on future applications).
  -- Approved: NO recognition here — billing + verified payment (Step 9) does that.
  if not _approve then
    update public.partner_centers set status = 'removed'
     where id = _centre and status = 'pending';
  end if;
end;
$$;
grant execute on function public.decide_partner_application(uuid, boolean, text) to authenticated;

-- 7. Reads.
create or replace function public.list_partner_applications(_include_decided boolean default false)
returns table (
  id uuid, partner_center_id uuid, centre_name text, state public.my_state,
  poc_name text, poc_email text, poc_phone text,
  submitted_by text, status public.partner_application_status,
  decision_note text, decided_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path to ''
as $$
  select a.id, a.partner_center_id, pc.name, pc.state,
         a.poc_name, a.poc_email, a.poc_phone,
         pr.full_name, a.status, a.decision_note, a.decided_at, a.created_at
  from public.partner_applications a
  join public.partner_centers pc on pc.id = a.partner_center_id
  left join public.profiles pr on pr.id = a.submitted_by_profile_id
  where (public.has_role('chairperson') or public.has_role('board_member') or public.has_role('system_admin'))
    and (_include_decided or a.status in ('submitted', 'pending'))
  order by case a.status when 'submitted' then 0 when 'pending' then 1 else 2 end, a.created_at desc;
$$;
grant execute on function public.list_partner_applications(boolean) to authenticated;

create or replace function public.list_centres_needing_attention()
returns table (id uuid, name text, state public.my_state, status public.partner_center_status, flagged_at timestamptz)
language sql stable security definer set search_path to ''
as $$
  select pc.id, pc.name, pc.state, pc.status, pc.flagged_no_instructor_at
  from public.partner_centers pc
  where pc.flagged_no_instructor_at is not null
    and pc.status in ('pending', 'recognized')
    and (public.has_role('chairperson') or public.has_role('board_member') or public.has_role('system_admin'))
  order by pc.flagged_no_instructor_at asc;
$$;
grant execute on function public.list_centres_needing_attention() to authenticated;

create or replace function public.list_my_centre_registrations()
returns table (
  id uuid, partner_center_id uuid, centre_name text, state public.my_state,
  centre_status public.partner_center_status, application_status public.partner_application_status,
  poc_email text, created_at timestamptz
)
language sql stable security definer set search_path to ''
as $$
  select a.id, a.partner_center_id, pc.name, pc.state, pc.status, a.status, a.poc_email, a.created_at
  from public.partner_applications a
  join public.partner_centers pc on pc.id = a.partner_center_id
  where a.submitted_by_profile_id = auth.uid()
  order by a.created_at desc;
$$;
grant execute on function public.list_my_centre_registrations() to authenticated;
