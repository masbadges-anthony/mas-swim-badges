-- 20260629160000_session_enrolments.sql
-- #12 Assessment Workflow Redesign — migration 3 of N. NEW table, no existing-object contact.
--
-- Tier 1 of the two-tier model: one row per candidate per session. Carries the SNAPSHOT
-- (candidate name, centre id+name, instructor-of-record, consent) frozen at roster submission,
-- plus the booked (starting) level and attendance. The per-level outcomes hang off this in
-- assessment_results (regrained in migration 4). Created empty here; the 12 live result rows are
-- migrated into enrolments atomically in migration 4.
--
-- Deferred to the grading/issuance layer (noted, not built here):
--   * examiner-facing read of assessment essentials — via a restricted VIEW (RLS can't hide
--     columns, and examiners must NOT see billing snapshot / instructor-of-record), so this
--     table's SELECT deliberately EXCLUDES the examiner role.
--   * attendance-marking policy (who flips present/absent on the day).
--   * instructor roster-edit-before-submit policy.

create type enrolment_attendance as enum ('registered','present','absent','no_show','withdrawn');

create table public.session_enrolments (
  id                               uuid primary key default gen_random_uuid(),
  session_id                       uuid not null references public.assessment_sessions(id) on delete cascade,
  candidate_id                     uuid not null references public.candidates(id),
  booked_level                     badge_level not null,
  assessor_profile_id              uuid references public.profiles(id),
  attendance                       enrolment_attendance not null default 'registered',
  consent_confirmed_at_submission  boolean not null default false,
  candidate_name_snapshot          text not null,
  partner_center_id_snapshot       uuid references public.partner_centers(id),
  partner_center_name_snapshot     text,
  instructor_of_record_profile_id  uuid references public.profiles(id),  -- nullable: legacy sessions may lack a requester
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  constraint session_enrolments_unique unique (session_id, candidate_id)
);

-- Self-contained updated_at touch (kept local to avoid depending on / colliding with a shared
-- function whose exact name isn't confirmed; trivial to consolidate to a shared set_updated_at() later).
create or replace function public.touch_session_enrolments_updated_at()
 returns trigger language plpgsql
 set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger trg_session_enrolments_updated_at
  before update on public.session_enrolments
  for each row execute function public.touch_session_enrolments_updated_at();

alter table public.session_enrolments enable row level security;

-- INSERT: the instructor who requested the session, or governance.
create policy session_enrolments_insert_session_owner on public.session_enrolments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.assessment_sessions s
      where s.id = session_id
        and s.requested_by_profile_id = (select auth.uid())
    )
  );

create policy session_enrolments_insert_governance on public.session_enrolments
  for insert to authenticated
  with check (
    public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  );

-- SELECT: session owner, the candidate's claiming guardian, or governance.
-- Examiners are intentionally omitted (firewall) — their assessment-facing read comes via a
-- restricted view in the grading layer.
create policy session_enrolments_select_scoped on public.session_enrolments
  for select to authenticated
  using (
    exists (
      select 1 from public.assessment_sessions s
      where s.id = session_id
        and s.requested_by_profile_id = (select auth.uid())
    )
    or exists (
      select 1 from public.candidates c
      where c.id = candidate_id
        and c.claimed_by_profile_id = (select auth.uid())
    )
    or public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  );

-- UPDATE: governance only for now (attendance-marking + instructor roster-edit policies land with
-- the grading layer once those flows are designed).
create policy session_enrolments_update_governance on public.session_enrolments
  for all to authenticated
  using (
    public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  )
  with check (
    public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  );
