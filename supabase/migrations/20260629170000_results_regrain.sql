-- 20260629170000_results_regrain.sql
-- #12 Assessment Workflow Redesign — migration 4 of N. STRUCTURAL: regrains assessment_results
-- from one-row-per-(session,candidate) to one-row-per-(enrolment,level), and backfills the 12
-- live rows into the new session_enrolments tier. Triggers/functions are PRESERVED untouched
-- (can_assess_candidate, enforce_assessment_coi, link_certificate_to_result read columns we keep).
--
-- session_id / candidate_id / assessor_profile_id stay DENORMALIZED on the level row by design —
-- that is exactly what lets the three functions need zero changes.
--
-- IDEMPOTENT: safe to re-run from the top regardless of partial prior application.

-- (1) Billing-stage enum (guarded).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'result_billing_stage') then
    create type result_billing_stage as enum ('booked', 'bonus');
  end if;
end $$;

-- (2) New columns (nullable for backfill; constrained at step 5).
alter table public.assessment_results
  add column if not exists enrolment_id    uuid references public.session_enrolments(id),
  add column if not exists billing_stage   result_billing_stage,
  add column if not exists fee_rm_snapshot numeric(8,2);

-- (3) Derive one enrolment per existing (session, candidate). 1:1 under the current unique key.
insert into public.session_enrolments (
  session_id, candidate_id, booked_level, assessor_profile_id, attendance,
  consent_confirmed_at_submission, candidate_name_snapshot,
  partner_center_id_snapshot, partner_center_name_snapshot, instructor_of_record_profile_id
)
select
  r.session_id,
  r.candidate_id,
  r.target_level,
  r.assessor_profile_id,
  case when r.outcome is not null then 'present'::enrolment_attendance
       else 'registered'::enrolment_attendance end,
  coalesce(c.parental_consent, false),
  c.full_name,
  c.partner_center_id,
  pc.name,
  coalesce(s.requested_by_profile_id, c.registered_by_profile_id)
from public.assessment_results r
join public.candidates c            on c.id  = r.candidate_id
join public.assessment_sessions s   on s.id  = r.session_id
left join public.partner_centers pc on pc.id = c.partner_center_id
on conflict (session_id, candidate_id) do nothing;

-- (4) Backfill UPDATEs with COI suspended (it fires on every UPDATE; we change no assessor here).
alter table public.assessment_results disable trigger assessment_results_enforce_coi;

update public.assessment_results r
  set enrolment_id = e.id
  from public.session_enrolments e
  where e.session_id = r.session_id
    and e.candidate_id = r.candidate_id
    and r.enrolment_id is null;

update public.assessment_results
  set billing_stage = 'booked'
  where billing_stage is null;

update public.assessment_results r
  set fee_rm_snapshot = f.fee_rm
  from public.fee_schedule f
  where f.level = r.target_level
    and r.fee_rm_snapshot is null;

alter table public.assessment_results enable trigger assessment_results_enforce_coi;

-- (5) Constrain the new structural columns (set not null is a no-op if already applied).
alter table public.assessment_results
  alter column enrolment_id  set not null,
  alter column billing_stage set default 'booked',
  alter column billing_stage set not null;
-- fee_rm_snapshot intentionally left nullable; grading/invoicing layer owns its lifecycle.

-- (6) Drop the old per-candidate uniqueness by its real (unknown) name. attname::text cast added.
do $$
declare _name text;
begin
  select c.conname into _name
  from pg_constraint c
  where c.conrelid = 'public.assessment_results'::regclass
    and c.contype = 'u'
    and (
      select array_agg(a.attname::text order by a.attname::text)
      from unnest(c.conkey) k(attnum)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    ) = array['candidate_id','session_id']
  limit 1;

  if _name is not null then
    execute format('alter table public.assessment_results drop constraint %I', _name);
  end if;
end $$;

-- (7) New per-level uniqueness (guarded): one outcome per candidate per level per session.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assessment_results'::regclass
      and conname = 'assessment_results_enrolment_level_key'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_enrolment_level_key unique (enrolment_id, target_level);
  end if;
end $$;
