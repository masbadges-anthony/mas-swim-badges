-- ============================================================================
-- Migration: 20260621110000_candidates
-- Phase:     1 — Claimable minor records
-- Purpose:   Candidates are CHILDREN (ages 5-12), and are NOT auth users. Each
--            is a claimable record: created by an instructor/center, optionally
--            claimed later by a parent's profile (Phase 3).
--
-- This is the most constraint-bound table in Phase 1. Design rules:
--   * Data minimization  — only identity + governance fields. No address, no
--     ID numbers, no photos, no medical/school data here. School/booking detail
--     lives on the (Phase 2) assessment record, not on the child's identity.
--   * Parental consent    — explicit flag + who/when recorded.
--   * Retention           — `retention_until`; actual duration is a PENDING
--     governance decision, so it is intentionally NOT hardcoded.
--   * Revocation/erasure   — never hard-deleted (would break certificate
--     lineage + audit). Erasure = anonymize_candidate(): strips PII, sets
--     status. Function provided below.
--   * No age CHECK         — a child ages over time and records are retained
--     after they age out, so eligibility (5-12 AT assessment) is a Phase 2
--     check, not a storage constraint.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Enum
-- ----------------------------------------------------------------------------
create type public.candidate_status as enum (
  'active',       -- normal, usable record
  'withdrawn',    -- consent revoked / deactivated; retained per policy, not usable
  'anonymized'    -- PII stripped after retention/erasure; shell kept for cert lineage
);


-- ----------------------------------------------------------------------------
-- candidates
-- ----------------------------------------------------------------------------
create table public.candidates (
  id                        uuid                     primary key default gen_random_uuid(),
  full_name                 text                     not null,
  date_of_birth             date,   -- app requires at registration; nullable only so erasure can clear it
  registered_by_profile_id  uuid                     references public.profiles (id)         on delete set null,
  partner_center_id         uuid                     references public.partner_centers (id)  on delete set null,
  claimed_by_profile_id     uuid                     references public.profiles (id)         on delete set null,
  parental_consent          boolean                  not null default false,
  consent_recorded_at       timestamptz,
  consent_recorded_by       uuid                     references public.profiles (id)         on delete set null,
  status                    public.candidate_status  not null default 'active',
  retention_until           date,   -- purge/anonymize after this date; duration = pending governance decision
  anonymized_at             timestamptz,
  created_at                timestamptz              not null default now(),
  updated_at                timestamptz              not null default now()
);

comment on table public.candidates is
  'Children (5-12) as claimable records, NOT auth users. Minimized identity + consent/retention governance fields.';
comment on column public.candidates.date_of_birth is
  'Required at registration by the app. Nullable at DB level only so anonymize_candidate() can erase it.';
comment on column public.candidates.registered_by_profile_id is
  'The adult (instructor / center admin) who created the record.';
comment on column public.candidates.claimed_by_profile_id is
  'The parent/guardian profile that has claimed this child (Phase 3 claim flow). Null until claimed.';
comment on column public.candidates.retention_until is
  'Erase/anonymize after this date. The retention period itself awaits governance sign-off — left unset by default on purpose.';

create index candidates_registered_by_idx on public.candidates (registered_by_profile_id);
create index candidates_center_idx        on public.candidates (partner_center_id);
create index candidates_claimed_by_idx    on public.candidates (claimed_by_profile_id);
create index candidates_status_idx        on public.candidates (status);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- Row Level Security
--   Minor data is sensitive: read access is tightly scoped to the people with a
--   legitimate relationship to the child. (Examiner read access is added in
--   Phase 2, scoped to assigned assessments — NOT a blanket grant here.)
-- ----------------------------------------------------------------------------
alter table public.candidates enable row level security;

-- SELECT --------------------------------------------------------------------
create policy "candidates_select_registrant"
  on public.candidates for select to authenticated
  using ( (select auth.uid()) = registered_by_profile_id );

create policy "candidates_select_claimed_parent"
  on public.candidates for select to authenticated
  using ( (select auth.uid()) = claimed_by_profile_id );

create policy "candidates_select_center_admin"
  on public.candidates for select to authenticated
  using ( partner_center_id is not null and public.has_role('partner_center_admin', partner_center_id) );

create policy "candidates_select_governance"
  on public.candidates for select to authenticated
  using (
    public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- INSERT --------------------------------------------------------------------
-- Registrant must stamp themselves as registered_by (anti-spoofing).
create policy "candidates_insert_instructor"
  on public.candidates for insert to authenticated
  with check (
    public.has_role('instructor')
    and (select auth.uid()) = registered_by_profile_id
  );

create policy "candidates_insert_center_admin"
  on public.candidates for insert to authenticated
  with check (
    partner_center_id is not null
    and public.has_role('partner_center_admin', partner_center_id)
    and (select auth.uid()) = registered_by_profile_id
  );

create policy "candidates_insert_governance"
  on public.candidates for insert to authenticated
  with check (
    public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- UPDATE --------------------------------------------------------------------
create policy "candidates_update_registrant"
  on public.candidates for update to authenticated
  using      ( (select auth.uid()) = registered_by_profile_id )
  with check ( (select auth.uid()) = registered_by_profile_id );

create policy "candidates_update_center_admin"
  on public.candidates for update to authenticated
  using      ( partner_center_id is not null and public.has_role('partner_center_admin', partner_center_id) )
  with check ( partner_center_id is not null and public.has_role('partner_center_admin', partner_center_id) );

-- Parent who claimed the child may update (e.g. correct details, withdraw consent).
create policy "candidates_update_claimed_parent"
  on public.candidates for update to authenticated
  using      ( (select auth.uid()) = claimed_by_profile_id )
  with check ( (select auth.uid()) = claimed_by_profile_id );

create policy "candidates_update_governance"
  on public.candidates for update to authenticated
  using (
    public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  )
  with check (
    public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  );

-- No DELETE policy by design. Erasure goes through anonymize_candidate() below,
-- which preserves the row (and thus certificate lineage) while removing PII.


-- ----------------------------------------------------------------------------
-- Erasure / revocation path
--
--   The documented way to honor a "remove my child's data" request. Keeps the
--   row so issued certificates still resolve, but clears direct identifiers and
--   marks the record anonymized. Authorized for program leadership OR the
--   claiming parent. SECURITY DEFINER so it can write past RLS once authorized.
-- ----------------------------------------------------------------------------
create or replace function public.anonymize_candidate(_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
    or exists (
      select 1 from public.candidates c
      where c.id = _candidate_id
        and c.claimed_by_profile_id = (select auth.uid())
    )
  ) then
    raise exception 'not authorized to anonymize candidate %', _candidate_id
      using errcode = '42501';
  end if;

  update public.candidates
     set full_name              = 'REDACTED',
         date_of_birth          = null,
         claimed_by_profile_id  = null,
         consent_recorded_by    = null,
         registered_by_profile_id = null,
         status                 = 'anonymized',
         anonymized_at          = now()
   where id = _candidate_id;
end;
$$;

comment on function public.anonymize_candidate(uuid) is
  'Erasure path for minor records. Strips PII, keeps the row for certificate lineage. Authorized: program leadership or the claiming parent.';

grant execute on function public.anonymize_candidate(uuid) to authenticated;
