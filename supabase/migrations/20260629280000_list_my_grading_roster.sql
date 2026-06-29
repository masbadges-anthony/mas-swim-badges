-- 20260629280000_list_my_grading_roster.sql
-- #12 Assessment Workflow Redesign — examiner-safe roster read.
--
-- session_enrolments deliberately EXCLUDES the examiner role from its SELECT policy (the
-- snapshot carries billing-adjacent fields: instructor-of-record, centre, consent). This
-- SECURITY DEFINER function gives the assigned examiner exactly the assessment data they
-- need — name, booked level, attendance, recorded per-level outcomes — and NOTHING about
-- fees, invoices, or who pays. It is the read backing the ExaminerGrading screen.

create or replace function public.list_my_grading_roster()
returns table(
  session_id uuid, venue text, scheduled_on date, session_status public.session_status,
  enrolment_id uuid, candidate_name text, booked_level public.badge_level,
  attendance public.enrolment_attendance, levels jsonb
)
language sql stable security definer set search_path to ''
as $$
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
  order by s.scheduled_on nulls last, e.candidate_name_snapshot;
$$;
grant execute on function public.list_my_grading_roster() to authenticated;
