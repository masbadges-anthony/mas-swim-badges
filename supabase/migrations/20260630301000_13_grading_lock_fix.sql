-- #13 fix — submit_session_results 'claimed' fix + post-submit write guards.

-- FIX: examiner edit-after-submit lock + the stale 'scheduled' status bug.
-- (1) submit_session_results advanced from 'scheduled' (old lifecycle) — under #13 the
--     state is 'claimed', so submit never actually completed the session. Fixed to 'claimed'.
-- (2) record_assessment_outcome + mark_attendance now refuse writes once the session is
--     past grading (completed/closed/archived/cancelled) — the server-side lock.

-- ---------------------------------------------------------------------------------
-- (1) submit_session_results — complete from 'claimed' (was 'scheduled').
-- ---------------------------------------------------------------------------------
create or replace function public.submit_session_results(_session_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_examiner       uuid;
  v_bill_to        uuid;
  v_partner_center uuid;
  v_subtotal       numeric;
  v_invoice_id     uuid;
begin
  select examiner_profile_id, requested_by_profile_id, partner_center_id
    into v_examiner, v_bill_to, v_partner_center
    from public.assessment_sessions
   where id = _session_id;

  if v_examiner is null or v_examiner <> (select auth.uid()) then
    raise exception 'not authorized: caller is not the assigned examiner for session %', _session_id
      using errcode = 'insufficient_privilege';
  end if;

  -- complete from 'claimed' (the #13 grading state). Won't revert a completed/closed session.
  update public.assessment_sessions
     set status = 'completed'
   where id = _session_id and status = 'claimed';

  -- STAGE 2: bonus-reconcile invoice from bonus passes (guarded; skips if one already live)
  if not exists (
    select 1 from public.invoices
    where session_id = _session_id and stage = 'bonus_reconcile' and status <> 'void'
  ) then
    select coalesce(sum(coalesce(r.fee_rm_snapshot, f.fee_rm)), 0)
      into v_subtotal
      from public.assessment_results r
      left join public.fee_schedule f on f.level = r.target_level
     where r.session_id = _session_id
       and r.billing_stage = 'bonus'
       and r.outcome = 'pass';

    if v_bill_to is not null and v_subtotal > 0 then
      insert into public.invoices
        (session_id, stage, bill_to_profile_id, partner_center_id, status, subtotal, total)
      values
        (_session_id, 'bonus_reconcile', v_bill_to, v_partner_center, 'pro_forma', v_subtotal, v_subtotal)
      returning id into v_invoice_id;

      insert into public.invoice_items
        (invoice_id, item_type, description, level, candidate_id, quantity, unit_amount, amount)
      select
        v_invoice_id, 'assessment_fee',
        'Bonus level pass — ' || r.target_level::text,
        r.target_level, r.candidate_id, 1,
        coalesce(r.fee_rm_snapshot, f.fee_rm), coalesce(r.fee_rm_snapshot, f.fee_rm)
      from public.assessment_results r
      left join public.fee_schedule f on f.level = r.target_level
      where r.session_id = _session_id and r.billing_stage = 'bonus' and r.outcome = 'pass';
    end if;
  end if;

  return v_invoice_id;
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (2a) mark_attendance — refuse once the session is past grading.
-- ---------------------------------------------------------------------------------
create or replace function public.mark_attendance(_enrolment_id uuid, _attendance enrolment_attendance)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_session  uuid;
  v_examiner uuid;
  v_status   public.session_status;
begin
  select e.session_id, s.examiner_profile_id, s.status
    into v_session, v_examiner, v_status
    from public.session_enrolments e
    join public.assessment_sessions s on s.id = e.session_id
   where e.id = _enrolment_id;

  if v_session is null then
    raise exception 'enrolment not found';
  end if;

  if v_status in ('completed','closed','archived','cancelled') then
    raise exception 'session is closed for grading (status %)', v_status using errcode = 'check_violation';
  end if;

  if not (
       (v_examiner is not null and v_examiner = (select auth.uid()))
       or public.has_role('chairperson') or public.has_role('board_member')
       or public.has_role('chief_examiner')
     ) then
    raise exception 'not authorized to mark attendance for this session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.session_enrolments set attendance = _attendance where id = _enrolment_id;
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (2b) record_assessment_outcome — refuse once the session is past grading.
--      (Only the status guard is added; chain/stage/fee logic unchanged.)
-- ---------------------------------------------------------------------------------
create or replace function public.record_assessment_outcome(_enrolment_id uuid, _level badge_level, _outcome assessment_outcome, _notes text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_session     uuid;
  v_candidate   uuid;
  v_booked      public.badge_level;
  v_examiner    uuid;
  v_status      public.session_status;
  v_levels      public.badge_level[];
  v_pos         int;
  v_booked_pos  int;
  v_prev        public.badge_level;
  v_prev_ok     boolean;
  v_stage       public.result_billing_stage;
  v_fee         numeric;
  v_result_id   uuid;
begin
  select e.session_id, e.candidate_id, e.booked_level
    into v_session, v_candidate, v_booked
  from public.session_enrolments e
  where e.id = _enrolment_id;

  if v_session is null then
    raise exception 'unknown enrolment %', _enrolment_id using errcode = 'check_violation';
  end if;

  select s.examiner_profile_id, s.status into v_examiner, v_status
  from public.assessment_sessions s
  where s.id = v_session;

  if v_examiner is null or v_examiner <> (select auth.uid()) then
    raise exception 'not authorized: caller is not the assigned examiner for session %', v_session
      using errcode = 'insufficient_privilege';
  end if;

  if v_status in ('completed','closed','archived','cancelled') then
    raise exception 'session is closed for grading (status %)', v_status using errcode = 'check_violation';
  end if;

  v_levels     := enum_range(null::public.badge_level);
  v_pos        := array_position(v_levels, _level);
  v_booked_pos := array_position(v_levels, v_booked);

  if v_pos < v_booked_pos then
    raise exception 'level % is below booked level % for this enrolment', _level, v_booked
      using errcode = 'check_violation';
  end if;

  if v_pos > v_booked_pos then
    v_prev := v_levels[v_pos - 1];
    select exists (
      select 1 from public.assessment_results r
      where r.enrolment_id = _enrolment_id and r.target_level = v_prev and r.outcome = 'pass'
    ) into v_prev_ok;
    if not v_prev_ok then
      raise exception 'cannot record %: prior level % not passed (no skipping)', _level, v_prev
        using errcode = 'check_violation';
    end if;
  end if;

  v_stage := case when v_pos = v_booked_pos then 'booked' else 'bonus' end;
  select fee_rm into v_fee from public.fee_schedule where level = _level;

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
$fn$;

-- belt-and-suspenders: grading roster only returns sessions with a paid booked invoice.

-- Defensive guard: grading only ever shows sessions whose booked-prepay invoice is PAID.
-- Under the new flow an examiner can't claim an unpaid session, so this is belt-and-
-- suspenders — it also auto-hides any legacy/stray assignment. Re-creates
-- list_my_grading_roster with the added paid filter; everything else unchanged.
create or replace function public.list_my_grading_roster()
returns table(
  session_id uuid, venue text, scheduled_on date, session_status public.session_status,
  enrolment_id uuid, candidate_name text, booked_level public.badge_level,
  attendance public.enrolment_attendance, levels jsonb
)
language sql stable security definer set search_path to ''
as $fn$
  select s.id, s.venue, s.scheduled_on, s.status,
         e.id, e.candidate_name_snapshot, e.booked_level, e.attendance,
         coalesce((
           select jsonb_agg(
             jsonb_build_object('level', r.target_level, 'outcome', r.outcome, 'stage', r.billing_stage)
             order by array_position(enum_range(null::public.badge_level), r.target_level))
           from public.assessment_results r where r.enrolment_id = e.id
         ), '[]'::jsonb)
  from public.assessment_sessions s
  join public.session_enrolments e on e.session_id = s.id
  where s.examiner_profile_id = (select auth.uid())
    and exists (
      select 1 from public.invoices i
      where i.session_id = s.id and i.stage = 'booked_prepay' and i.status = 'paid'
    )
  order by s.scheduled_on nulls last, e.candidate_name_snapshot;
$fn$;
