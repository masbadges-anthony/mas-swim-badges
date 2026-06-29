-- 20260629190000_record_assessment_outcome.sql
-- #12 Assessment Workflow Redesign — grading/issuance layer, piece 1 of 4.
--
-- Unified grading entry point for the assigned examiner. SECURITY DEFINER so it authorizes
-- internally (no raw INSERT/UPDATE grant to examiners) and keeps the fee server-side.
--
-- Rules enforced in one place:
--   * caller must be the session's assigned examiner (assessment_sessions.examiner_profile_id)
--   * target level cannot be below the enrolment's booked_level
--   * a level above booked can only be recorded if the level directly beneath it already PASSED
--     (no skipping; the chain stops at the first refer)
--   * billing_stage and fee_rm_snapshot are derived server-side (examiner never sets fee)
-- The existing enforce_assessment_coi trigger still fires on the write (examiner-active + non-COI backstop).
--
-- NOTE: all public-schema enum types are schema-qualified — required because SET search_path TO ''
-- validates the body (incl. DECLARE) under an empty path at creation.

create or replace function public.record_assessment_outcome(
  _enrolment_id uuid,
  _level        public.badge_level,
  _outcome      public.assessment_outcome,
  _notes        text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_session     uuid;
  v_candidate   uuid;
  v_booked      public.badge_level;
  v_examiner    uuid;
  v_levels      public.badge_level[];
  v_pos         int;
  v_booked_pos  int;
  v_prev        public.badge_level;
  v_prev_ok     boolean;
  v_stage       public.result_billing_stage;
  v_fee         numeric;
  v_result_id   uuid;
begin
  -- resolve the enrolment
  select e.session_id, e.candidate_id, e.booked_level
    into v_session, v_candidate, v_booked
  from public.session_enrolments e
  where e.id = _enrolment_id;

  if v_session is null then
    raise exception 'unknown enrolment %', _enrolment_id using errcode = 'check_violation';
  end if;

  -- authorize: caller is the assigned examiner for this session
  select s.examiner_profile_id into v_examiner
  from public.assessment_sessions s
  where s.id = v_session;

  if v_examiner is null or v_examiner <> (select auth.uid()) then
    raise exception 'not authorized: caller is not the assigned examiner for session %', v_session
      using errcode = 'insufficient_privilege';
  end if;

  -- ordinal positions within the badge_level enum
  v_levels     := enum_range(null::public.badge_level);
  v_pos        := array_position(v_levels, _level);
  v_booked_pos := array_position(v_levels, v_booked);

  if v_pos < v_booked_pos then
    raise exception 'level % is below booked level % for this enrolment', _level, v_booked
      using errcode = 'check_violation';
  end if;

  -- chain rule: any level above booked requires the immediately-lower level to be a pass
  if v_pos > v_booked_pos then
    v_prev := v_levels[v_pos - 1];
    select exists (
      select 1 from public.assessment_results r
      where r.enrolment_id = _enrolment_id
        and r.target_level = v_prev
        and r.outcome      = 'pass'
    ) into v_prev_ok;

    if not v_prev_ok then
      raise exception 'cannot record %: prior level % not passed (no skipping)', _level, v_prev
        using errcode = 'check_violation';
    end if;
  end if;

  -- server-side stage + fee
  v_stage := case when v_pos = v_booked_pos then 'booked' else 'bonus' end;
  select fee_rm into v_fee from public.fee_schedule where level = _level;

  -- upsert the per-level result. On re-grade, outcome/notes/assessor refresh but stage+fee are
  -- preserved (a correction must not flip the billing classification of an already-priced level).
  insert into public.assessment_results
    (enrolment_id, session_id, candidate_id, target_level, billing_stage,
     fee_rm_snapshot, assessor_profile_id, outcome, assessed_on, notes)
  values
    (_enrolment_id, v_session, v_candidate, _level, v_stage,
     v_fee, (select auth.uid()), _outcome, current_date, _notes)
  on conflict (enrolment_id, target_level) do update
    set outcome             = excluded.outcome,
        notes               = excluded.notes,
        assessed_on         = excluded.assessed_on,
        assessor_profile_id = excluded.assessor_profile_id
  returning id into v_result_id;

  return v_result_id;
end;
$function$;

grant execute on function public.record_assessment_outcome(uuid, public.badge_level, public.assessment_outcome, text) to authenticated;
