-- 20260721120000_create_session_with_roster_add_remarks.sql
--
-- Extends create_session_with_roster to accept and store _instructor_remarks
-- at session creation time. Fixes the mismatch where RosterBooking.tsx passes
-- _instructor_remarks but the RPC signature didn't accept it.
--
-- Function is recreated with the same body plus:
--   1. New parameter _instructor_remarks text default null
--   2. 200-char guard
--   3. Insert into the instructor_remarks column of assessment_sessions
--
-- Return type unchanged (jsonb) — no DROP FUNCTION needed by return signature,
-- but the parameter list changed, so an explicit DROP is required.

-- Drop old signature first so the new one can be created (parameter list change).
drop function if exists public.create_session_with_roster(jsonb, date, public.my_state, text, uuid, uuid);

create or replace function public.create_session_with_roster(
  _candidates          jsonb,
  _scheduled_on        date,
  _state               public.my_state default null,
  _venue               text default null,
  _partner_center_id   uuid default null,
  _requested_by        uuid default null,   -- governance on-behalf; null = self
  _instructor_remarks  text default null    -- NEW: booking-time remarks
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_caller     uuid := (select auth.uid());
  v_owner      uuid;
  v_pc_name    text;
  v_session_id uuid;
  v_row        jsonb;
  v_swimmer    text;
  v_name       text;
  v_dob        date;
  v_level      public.badge_level;
  v_consent    boolean;
  v_candidate  uuid;
  v_enrolment  uuid;
  v_fee        numeric;
  v_accepted   jsonb := '[]'::jsonb;
  v_rejected   jsonb := '[]'::jsonb;
  v_subtotal   numeric;
  v_invoice_id uuid;
  v_invoice_no text;
  v_remarks    text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Booker / bill-to. Governance may book on behalf of an instructor.
  if _requested_by is not null and _requested_by <> v_caller then
    if not (public.has_role('chairperson') or public.has_role('board_member')
            or public.has_role('chief_examiner')) then
      raise exception 'not authorized to book on behalf of another instructor'
        using errcode = 'insufficient_privilege';
    end if;
    v_owner := _requested_by;
  else
    v_owner := v_caller;
  end if;

  -- Caller must hold a booking-eligible role.
  if not (public.has_role('instructor') or public.has_role('master_trainer')
          or public.has_role('chairperson') or public.has_role('board_member')
          or public.has_role('chief_examiner')) then
    raise exception 'not authorized to create sessions'
      using errcode = 'insufficient_privilege';
  end if;

  -- 30-day minimum: assessment must be booked at least 30 days out.
  if _scheduled_on is null or _scheduled_on < (current_date + 30) then
    raise exception 'assessment date must be at least 30 days from today'
      using errcode = 'check_violation';
  end if;

  -- Validate remarks length (200-char cap per schema check).
  v_remarks := nullif(trim(coalesce(_instructor_remarks, '')), '');
  if v_remarks is not null and char_length(v_remarks) > 200 then
    raise exception 'instructor_remarks exceeds 200 characters'
      using errcode = 'check_violation';
  end if;

  select name into v_pc_name from public.partner_centers where id = _partner_center_id;

  -- Create the session, payment-gated from birth, with instructor_remarks in-place.
  insert into public.assessment_sessions
    (requested_by_profile_id, partner_center_id, state, venue, scheduled_on, status, instructor_remarks)
  values
    (v_owner, _partner_center_id, _state, _venue, _scheduled_on, 'awaiting_payment', v_remarks)
  returning id into v_session_id;

  -- Roster loop (verbatim from previous).
  for v_row in select value from jsonb_array_elements(_candidates) loop
    begin
      v_swimmer := nullif(trim(coalesce(v_row->>'swimmer_id', '')), '');
      v_name    := trim(coalesce(v_row->>'full_name', ''));
      v_consent := coalesce((v_row->>'parental_consent')::boolean, false);

      if length(v_name) < 2 then
        raise exception 'missing or too-short full_name';
      end if;
      if (v_row->>'date_of_birth') is null then
        raise exception 'missing date_of_birth';
      end if;
      v_dob := (v_row->>'date_of_birth')::date;

      begin
        v_level := (v_row->>'booked_level')::public.badge_level;
      exception when others then
        raise exception 'invalid booked_level: %', coalesce(v_row->>'booked_level', '(null)');
      end;

      if v_swimmer is not null then
        select id into v_candidate
          from public.candidates
         where swimmer_id = v_swimmer and date_of_birth = v_dob;
        if v_candidate is null then
          raise exception 'swimmer_id % does not match a candidate with that DOB', v_swimmer;
        end if;
      else
        insert into public.candidates
          (full_name, date_of_birth, registered_by_profile_id, partner_center_id,
           parental_consent, consent_recorded_at, consent_recorded_by)
        values
          (v_name, v_dob, v_caller, _partner_center_id,
           v_consent,
           case when v_consent then now() else null end,
           case when v_consent then v_caller else null end)
        returning id into v_candidate;
      end if;

      select full_name into v_name from public.candidates where id = v_candidate;

      insert into public.session_enrolments
        (session_id, candidate_id, booked_level, attendance,
         consent_confirmed_at_submission, candidate_name_snapshot,
         partner_center_id_snapshot, partner_center_name_snapshot, instructor_of_record_profile_id)
      values
        (v_session_id, v_candidate, v_level, 'registered',
         v_consent, v_name, _partner_center_id, v_pc_name, v_caller)
      returning id into v_enrolment;

      select fee_rm into v_fee from public.fee_schedule where level = v_level;

      insert into public.assessment_results
        (enrolment_id, session_id, candidate_id, target_level, billing_stage, fee_rm_snapshot)
      values
        (v_enrolment, v_session_id, v_candidate, v_level, 'booked', v_fee);

      v_accepted := v_accepted || jsonb_build_object(
        'full_name', v_name, 'candidate_id', v_candidate,
        'enrolment_id', v_enrolment, 'booked_level', v_level::text);

    exception when others then
      v_rejected := v_rejected || jsonb_build_object(
        'full_name', coalesce(v_row->>'full_name', ''),
        'swimmer_id', coalesce(v_row->>'swimmer_id', ''),
        'reason', sqlerrm);
    end;
  end loop;

  -- No valid candidates -> roll the whole thing back (no empty session/invoice).
  if jsonb_array_length(v_accepted) = 0 then
    raise exception 'no valid candidates rostered; session not created. Rejected: %', v_rejected::text
      using errcode = 'check_violation';
  end if;

  -- Stage-1 (booked-prepay) invoice for the accepted roster, gapless number.
  select coalesce(sum(f.fee_rm), 0)
    into v_subtotal
    from public.session_enrolments e
    join public.fee_schedule f on f.level = e.booked_level
   where e.session_id = v_session_id;

  v_invoice_no := public.next_invoice_no();

  insert into public.invoices
    (session_id, stage, bill_to_profile_id, partner_center_id, status, subtotal, total, receipt_no)
  values
    (v_session_id, 'booked_prepay', v_owner, _partner_center_id, 'pro_forma',
     v_subtotal, v_subtotal, v_invoice_no)
  returning id into v_invoice_id;

  insert into public.invoice_items
    (invoice_id, item_type, description, level, candidate_id, quantity, unit_amount, amount)
  select
    v_invoice_id, 'assessment_fee',
    'Assessment fee — ' || e.booked_level::text,
    e.booked_level, e.candidate_id, 1, f.fee_rm, f.fee_rm
  from public.session_enrolments e
  join public.fee_schedule f on f.level = e.booked_level
  where e.session_id = v_session_id;

  return jsonb_build_object(
    'session_id',     v_session_id,
    'invoice_id',     v_invoice_id,
    'invoice_no',     v_invoice_no,
    'invoice_total',  v_subtotal,
    'accepted_count', jsonb_array_length(v_accepted),
    'rejected_count', jsonb_array_length(v_rejected),
    'accepted',       v_accepted,
    'rejected',       v_rejected);
end;
$fn$;

grant execute on function public.create_session_with_roster(jsonb, date, public.my_state, text, uuid, uuid, text) to authenticated;
