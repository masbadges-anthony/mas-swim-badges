-- #15 unit 2 — per-session certificate list for the session detail.
-- Visible to the booking instructor, the assigned examiner, or governance/billing.
create or replace function public.list_session_certificates(_session_id uuid)
 returns table(
   serial         text,
   candidate_name text,
   level          public.badge_level,
   billing_stage  public.result_billing_stage,
   issued_on      date
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select c.serial, c.candidate_name_snapshot, c.level, r.billing_stage, c.issued_on
  from public.certificates c
  join public.assessment_results  r on r.certificate_id = c.id
  join public.assessment_sessions s on s.id = r.session_id
  where r.session_id = _session_id
    and (
      s.requested_by_profile_id = (select auth.uid())
      or s.examiner_profile_id = (select auth.uid())
      or public.has_role('chairperson') or public.has_role('board_member')
      or public.has_role('chief_examiner') or public.has_role('system_admin')
      or public.has_role('finance_officer')
    )
  order by c.candidate_name_snapshot,
           array_position(enum_range(null::public.badge_level), c.level);
$fn$;

grant execute on function public.list_session_certificates(uuid) to authenticated;
