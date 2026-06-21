-- ============================================================================
-- Migration: 20260621100000_memberships
-- Phase:     1 — RBAC core
-- Purpose:   The access-control spine. A membership is one grant of one role
--            to one person, optionally scoped to a state (examiner pools) or a
--            partner center (center admins). `has_role()` reads this table and
--            is called by every RLS policy in the system from here on.
--
-- Recursion note: has_role() is SECURITY DEFINER, so it reads `memberships`
--   WITHOUT triggering memberships' own RLS. That is what lets policies on this
--   very table call has_role() without infinite recursion.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

-- The full role taxonomy from the governance manual (Section 3.2).
--   National authority : board_member, coaching_panel, chairperson,
--                         chief_examiner, examiner_trainer
--   State-scoped pool  : examiner
--   Flexible           : instructor (standalone OR center-affiliated)
--   Center-scoped      : partner_center_admin
create type public.membership_role as enum (
  'board_member',
  'coaching_panel',
  'chairperson',
  'chief_examiner',
  'examiner_trainer',
  'examiner',
  'instructor',
  'partner_center_admin'
);

-- Appointment lifecycle (manual: 2-year terms, renewals, suspension, removal).
create type public.membership_status as enum (
  'pending', 'active', 'suspended', 'expired', 'revoked'
);


-- ----------------------------------------------------------------------------
-- memberships
-- ----------------------------------------------------------------------------
create table public.memberships (
  id                 uuid                      primary key default gen_random_uuid(),
  profile_id         uuid                      not null references public.profiles (id)        on delete cascade,
  role               public.membership_role    not null,
  partner_center_id  uuid                      references public.partner_centers (id)          on delete cascade,
  state              public.my_state,
  status             public.membership_status  not null default 'pending',
  granted_at         date                      not null default current_date,
  expires_at         date,                     -- 2-year terms; null = no fixed expiry
  created_at         timestamptz               not null default now(),
  updated_at         timestamptz               not null default now(),

  -- Scope validity: each role may only carry the scope that makes sense for it.
  -- Encodes the governance model in data, so a malformed grant can't be stored.
  constraint memberships_scope_valid check (
    case role
      when 'partner_center_admin' then partner_center_id is not null
      when 'examiner'             then state is not null and partner_center_id is null
      when 'board_member'         then partner_center_id is null
      when 'coaching_panel'       then partner_center_id is null
      when 'chairperson'          then partner_center_id is null
      when 'chief_examiner'       then partner_center_id is null
      when 'examiner_trainer'     then partner_center_id is null
      else true   -- instructor: may be standalone or center-affiliated
    end
  )
);

comment on table public.memberships is
  'RBAC core. One row = one role grant to one person, scoped by state and/or center. Read by has_role().';
comment on column public.memberships.state is
  'Set for examiners (their state pool). Null for national roles.';
comment on column public.memberships.expires_at is
  'Term end. has_role() treats a past expiry as inactive even if status was not yet flipped.';

create index memberships_profile_idx on public.memberships (profile_id);
create index memberships_center_idx  on public.memberships (partner_center_id);

-- One active grant of a given (role, center) per person. NULLS NOT DISTINCT so
-- two national active grants of the same role can't both exist (PG15+).
create unique index memberships_unique_active
  on public.memberships (profile_id, role, partner_center_id)
  nulls not distinct
  where status = 'active';

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- has_role() — the function every RLS policy calls.
--
--   true  when the current user holds an ACTIVE, UN-EXPIRED membership of
--         `_role`. If `_center_id` is given, the membership must be scoped to
--         that center; if omitted, center scope is ignored (national check).
--
--   SECURITY DEFINER + empty search_path:
--     - definer rights read `memberships` past its RLS (breaks recursion);
--     - empty search_path forces fully-qualified names.
-- ----------------------------------------------------------------------------
create or replace function public.has_role(
  _role      public.membership_role,
  _center_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.profile_id = (select auth.uid())
      and m.role       = _role
      and m.status     = 'active'
      and (m.expires_at is null or m.expires_at >= current_date)
      and (_center_id is null or m.partner_center_id = _center_id)
  );
$$;

comment on function public.has_role(public.membership_role, uuid) is
  'RLS helper. True if the current user holds an active, un-expired membership of _role (optionally scoped to _center_id).';

grant execute on function public.has_role(public.membership_role, uuid) to authenticated, anon;


-- ----------------------------------------------------------------------------
-- Row Level Security on memberships
-- ----------------------------------------------------------------------------
alter table public.memberships enable row level security;

-- Read your own memberships (no has_role call -> no recursion path).
create policy "memberships_select_own"
  on public.memberships
  for select
  to authenticated
  using ( (select auth.uid()) = profile_id );

-- Program leadership can read all memberships.
create policy "memberships_select_governance"
  on public.memberships
  for select
  to authenticated
  using (
    public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- Chairperson / Board create any membership.
create policy "memberships_insert_admin"
  on public.memberships
  for insert
  to authenticated
  with check ( public.has_role('chairperson') or public.has_role('board_member') );

-- Chief Examiner maintains the Examiner Register: examiner rows only.
create policy "memberships_insert_chief_examiner"
  on public.memberships
  for insert
  to authenticated
  with check ( public.has_role('chief_examiner') and role = 'examiner' );

-- Chairperson / Board update any membership.
create policy "memberships_update_admin"
  on public.memberships
  for update
  to authenticated
  using      ( public.has_role('chairperson') or public.has_role('board_member') )
  with check ( public.has_role('chairperson') or public.has_role('board_member') );

-- Chief Examiner updates examiner rows (e.g. suspend, renew).
create policy "memberships_update_chief_examiner"
  on public.memberships
  for update
  to authenticated
  using      ( public.has_role('chief_examiner') and role = 'examiner' )
  with check ( public.has_role('chief_examiner') and role = 'examiner' );

-- Hard delete is Chairperson / Board only. Everyone else revokes via status.
create policy "memberships_delete_admin"
  on public.memberships
  for delete
  to authenticated
  using ( public.has_role('chairperson') or public.has_role('board_member') );


-- ----------------------------------------------------------------------------
-- BOOTSTRAP — run manually, once, after the founding officers have signed up.
--
-- The policies above mean an authenticated user cannot create the FIRST
-- membership (no one has a role yet to authorize it). That is intentional.
-- Seed the founding officers here in the SQL editor, which runs privileged and
-- bypasses RLS. Replace each UUID with the real profiles.id (Table Editor ->
-- profiles, after that person has signed up at least once).
--
-- insert into public.memberships (profile_id, role, status, expires_at) values
--   ('<nancy-yap-profile-uuid>',   'chairperson',     'active', (current_date + interval '2 years')::date),
--   ('<clara-chung-profile-uuid>', 'chief_examiner',  'active', (current_date + interval '2 years')::date),
--   ('<melvin-chua-profile-uuid>', 'examiner_trainer','active', (current_date + interval '2 years')::date);
-- ----------------------------------------------------------------------------
