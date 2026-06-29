-- 20260629240000_mark_attendance.sql
-- #12 Assessment Workflow Redesign — attendance marking.
-- Assigned examiner (governance override) flips a candidate's attendance on the day.
-- Absence records no outcome, so the payment-gated issuer (mints only on outcome='pass') skips it.

create or replace function public.mark_attendance(
  _enrolment_id uuid,
  _attendance   public.enrolment_attendance
)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_session  uuid;
  v_examiner uuid;
begin
  select e.session_id, s.examiner_profile_id
    into v_session, v_examiner
    from public.session_enrolments e
    join public.assessment_sessions s on s.id = e.session_id
   where e.id = _enrolment_id;

  if v_session is null then
    raise exception 'enrolment not found';
  end if;

  if not (
       (v_examiner is not null and v_examiner = (select auth.uid()))
       or public.has_role('chairperson') or public.has_role('board_member')
       or public.has_role('chief_examiner')
     ) then
    raise exception 'not authorized to mark attendance for this session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.session_enrolments
     set attendance = _attendance
   where id = _enrolment_id;
end;
$function$;

grant execute on function public.mark_attendance(uuid, public.enrolment_attendance) to authenticated;
