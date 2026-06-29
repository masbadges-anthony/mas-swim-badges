-- 20260629230000_submit_roster.sql
-- #12 Assessment Workflow Redesign — bulk roster intake.
-- Takes an instructor's candidate list (jsonb), does new-vs-existing matching via lookup
-- (reject-on-mismatch), writes the enrolment snapshot, and creates the booked-level result row.
-- Each candidate is its own subtransaction; one bad row is reported, not fatal to the batch.

create or replace function public.submit_roster(_session_id uuid, _candidates jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_owner          uuid;
  v_status         text;
  v_partner_center uuid;
  v_pc_name        text;
  v_row            jsonb;
  v_swimmer        text;
  v_name           text;
  v_dob            date;
  v_level          public.badge_level;
  v_consent        boolean;
  v_candidate      uuid;
  v_enrolment      uuid;
  v_fee            numeric;
  v_accepted       jsonb := '[]'::jsonb;
  v_rejected       jsonb := '[]'::jsonb;
begin
  select requested_by_profile_id, status, partner_center_id
    into v_owner, v_status, v_partner_center
    from public.assessment_sessions
   where id = _session_id;

  if v_owner is null then
    raise exception 'session not found';
  end if;

  if v_owner <> (select auth.uid())
     and not (public.has_role('chairperson') or public.has_role('board_member')
              or public.has_role('chief_examiner')) then
    raise exception 'not authorized to submit this roster' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('requested', 'examiner_invited') then
    raise exception 'roster is locked: session status is %', v_status using errcode = 'check_violation';
  end if;

  select name into v_pc_name from public.partner_centers where id = v_partner_center;

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
          (v_name, v_dob, (select auth.uid()), v_partner_center,
           v_consent,
           case when v_consent then now() else null end,
           case when v_consent then (select auth.uid()) else null end)
        returning id into v_candidate;
      end if;

      select full_name into v_name from public.candidates where id = v_candidate;

      insert into public.session_enrolments
        (session_id, candidate_id, booked_level, attendance,
         consent_confirmed_at_submission, candidate_name_snapshot,
         partner_center_id_snapshot, partner_center_name_snapshot, instructor_of_record_profile_id)
      values
        (_session_id, v_candidate, v_level, 'registered',
         v_consent, v_name, v_partner_center, v_pc_name, (select auth.uid()))
      returning id into v_enrolment;

      select fee_rm into v_fee from public.fee_schedule where level = v_level;

      insert into public.assessment_results
        (enrolment_id, session_id, candidate_id, target_level, billing_stage, fee_rm_snapshot)
      values
        (v_enrolment, _session_id, v_candidate, v_level, 'booked', v_fee);

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

  return jsonb_build_object(
    'accepted_count', jsonb_array_length(v_accepted),
    'rejected_count', jsonb_array_length(v_rejected),
    'accepted', v_accepted,
    'rejected', v_rejected);
end;
$function$;

grant execute on function public.submit_roster(uuid, jsonb) to authenticated;
