-- ============================================================================
-- Migration: 20260621130000_assessments
-- Phase:     2 — Assessment + grading
-- Purpose:   The assessment process (manual Section 11). A booking becomes a
--            scheduled session with an assigned examiner; each candidate on it
--            gets a result (Pass / Refer). A Pass is what a certificate is
--            issued against.
--
-- Headline constraint (non-negotiable): CONFLICT OF INTEREST ENFORCED IN DATA.
--   An examiner may not assess a candidate they instruct. This is a TRIGGER,
--   not a UI rule — the database refuses the row. (Manual Section 10.1.)
--
-- Also delivers the deferred "tighten examiner scope": an examiner can read a
-- candidate only when assigned to assess them, via a SECURITY DEFINER helper
-- (same recursion-avoidance pattern as has_role()).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.session_status as enum (
  'requested',   -- booking submitted, no examiner/date yet
  'scheduled',   -- examiner assigned + date set
  'completed',   -- assessment held, results recorded
  'cancelled'
);

-- Manual outcome vocabulary: Pass or Refer (not "fail").
create type public.assessment_outcome as enum ('pass', 'refer');


-- ----------------------------------------------------------------------------
-- assessment_sessions  — the booking / assessment event
-- ----------------------------------------------------------------------------
create table public.assessment_sessions (
  id                     uuid                  primary key default gen_random_uuid(),
  requested_by_profile_id uuid                 references public.profiles (id)        on delete set null,
  partner_center_id      uuid                  references public.partner_centers (id) on delete set null,
  examiner_profile_id    uuid                  references public.profiles (id)        on delete set null,
  state                  public.my_state,
  venue                  text,
  scheduled_on           date,
  status                 public.session_status not null default 'requested',
  created_at             timestamptz           not null default now(),
  updated_at             timestamptz           not null default now()
);

comment on table public.assessment_sessions is
  'An assessment booking/event. Requested by an instructor or center; an examiner is assigned to run it.';

create index assessment_sessions_examiner_idx  on public.assessment_sessions (examiner_profile_id);
create index assessment_sessions_requester_idx on public.assessment_sessions (requested_by_profile_id);
create index assessment_sessions_center_idx    on public.assessment_sessions (partner_center_id);

create trigger assessment_sessions_set_updated_at
  before update on public.assessment_sessions
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- assessment_results  — one row per candidate per session
--   outcome NULL  => on the roster, not yet graded
--   outcome set   => graded (pass/refer)
-- ----------------------------------------------------------------------------
create table public.assessment_results (
  id                  uuid                       primary key default gen_random_uuid(),
  session_id          uuid                       not null references public.assessment_sessions (id) on delete cascade,
  candidate_id        uuid                       not null references public.candidates (id)          on delete restrict,
  target_level        public.badge_level         not null,
  assessor_profile_id uuid                       references public.profiles (id)                     on delete set null,
  outcome             public.assessment_outcome,           -- null until graded
  assessed_on         date,
  certificate_id      uuid unique                references public.certificates (id)                 on delete set null,
  notes               text,
  created_at          timestamptz                not null default now(),
  updated_at          timestamptz                not null default now(),

  constraint assessment_results_unique_per_session unique (session_id, candidate_id)
);

comment on table public.assessment_results is
  'Per-candidate assessment outcome. Doubles as the session roster while outcome is null. A pass links to its issued certificate.';

create index assessment_results_session_idx   on public.assessment_results (session_id);
create index assessment_results_candidate_idx on public.assessment_results (candidate_id);
create index assessment_results_assessor_idx  on public.assessment_results (assessor_profile_id);

create trigger assessment_results_set_updated_at
  before update on public.assessment_results
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- CONFLICT OF INTEREST + assessor validity — enforced in data
--
--   On insert/update of a result with an assessor set:
--     1. the assessor must NOT be the candidate's instructor (registrant);
--     2. the assessor must hold an active examiner membership.
--   Either failure aborts the write.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_assessment_coi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instructor  uuid;
  v_is_examiner boolean;
begin
  if new.assessor_profile_id is null then
    return new;   -- unassigned roster row; nothing to validate yet
  end if;

  select c.registered_by_profile_id
    into v_instructor
    from public.candidates c
   where c.id = new.candidate_id;

  if v_instructor is not null and v_instructor = new.assessor_profile_id then
    raise exception
      'conflict of interest: examiner % instructs candidate %', new.assessor_profile_id, new.candidate_id
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.memberships m
    where m.profile_id = new.assessor_profile_id
      and m.role       = 'examiner'
      and m.status     = 'active'
      and (m.expires_at is null or m.expires_at >= current_date)
  ) into v_is_examiner;

  if not v_is_examiner then
    raise exception
      'assessor % is not an active examiner', new.assessor_profile_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_assessment_coi() is
  'Trigger: blocks a result whose assessor instructs the candidate (COI) or is not an active examiner.';

create trigger assessment_results_enforce_coi
  before insert or update on public.assessment_results
  for each row execute function public.enforce_assessment_coi();


-- ----------------------------------------------------------------------------
-- can_assess_candidate() — scopes examiner access to assigned candidates only.
--   SECURITY DEFINER so the membership/assignment lookups bypass RLS (no
--   recursion when used inside the candidates SELECT policy).
-- ----------------------------------------------------------------------------
create or replace function public.can_assess_candidate(_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    -- assigned as the session examiner for a session that rosters this candidate
    select 1
    from public.assessment_sessions s
    join public.assessment_results  r on r.session_id = s.id
    where s.examiner_profile_id = (select auth.uid())
      and r.candidate_id        = _candidate_id
  )
  or exists (
    -- directly named assessor on a result for this candidate
    select 1
    from public.assessment_results r
    where r.assessor_profile_id = (select auth.uid())
      and r.candidate_id        = _candidate_id
  );
$$;

comment on function public.can_assess_candidate(uuid) is
  'True if the current user is the assigned examiner/assessor for the given candidate. Used to scope examiner reads.';

grant execute on function public.can_assess_candidate(uuid) to authenticated;

-- Examiners may now read candidates they are assigned to assess — and only those.
create policy "candidates_select_examiner"
  on public.candidates for select to authenticated
  using ( public.can_assess_candidate(id) );


-- ----------------------------------------------------------------------------
-- RLS — assessment_sessions
-- ----------------------------------------------------------------------------
alter table public.assessment_sessions enable row level security;

create policy "sessions_select_party"
  on public.assessment_sessions for select to authenticated
  using (
    (select auth.uid()) = requested_by_profile_id
    or (select auth.uid()) = examiner_profile_id
    or (partner_center_id is not null and public.has_role('partner_center_admin', partner_center_id))
    or public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  );

-- Bookings created by an instructor or a center admin (stamping themselves), or governance.
create policy "sessions_insert_requester"
  on public.assessment_sessions for insert to authenticated
  with check (
    (select auth.uid()) = requested_by_profile_id
    and (
      public.has_role('instructor')
      or (partner_center_id is not null and public.has_role('partner_center_admin', partner_center_id))
    )
  );

create policy "sessions_insert_governance"
  on public.assessment_sessions for insert to authenticated
  with check ( public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner') );

-- Scheduling / examiner assignment is a Chief Examiner / Chairperson / Board action.
create policy "sessions_update_governance"
  on public.assessment_sessions for update to authenticated
  using      ( public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner') )
  with check ( public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner') );

-- The requester may amend their own booking while it is still just 'requested'.
create policy "sessions_update_requester"
  on public.assessment_sessions for update to authenticated
  using      ( (select auth.uid()) = requested_by_profile_id and status = 'requested' )
  with check ( (select auth.uid()) = requested_by_profile_id );


-- ----------------------------------------------------------------------------
-- RLS — assessment_results
-- ----------------------------------------------------------------------------
alter table public.assessment_results enable row level security;

create policy "results_select_scoped"
  on public.assessment_results for select to authenticated
  using (
    (select auth.uid()) = assessor_profile_id
    or public.can_assess_candidate(candidate_id)
    or exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.claimed_by_profile_id = (select auth.uid())
    )
    or public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner')
  );

-- Roster rows (ungraded) are created by governance/chief examiner when scheduling.
create policy "results_insert_governance"
  on public.assessment_results for insert to authenticated
  with check ( public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner') );

-- The assessing examiner records the outcome (COI trigger still guards the row).
create policy "results_update_assessor"
  on public.assessment_results for update to authenticated
  using      ( (select auth.uid()) = assessor_profile_id and public.has_role('examiner') )
  with check ( (select auth.uid()) = assessor_profile_id and public.has_role('examiner') );

create policy "results_update_governance"
  on public.assessment_results for update to authenticated
  using      ( public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner') )
  with check ( public.has_role('chairperson') or public.has_role('board_member') or public.has_role('chief_examiner') );
