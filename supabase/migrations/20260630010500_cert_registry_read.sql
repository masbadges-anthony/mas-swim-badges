-- #14 unit 1 (read side) — issued-certificate registry for the (now read-only) screen.
-- Joins certificates -> assessment_results (back-link) -> sessions for context.
create or replace function public.list_issued_certificates(_limit int default 300)
 returns table(
   serial         text,
   candidate_name text,
   level          public.badge_level,
   billing_stage  public.result_billing_stage,
   issued_on      date,
   venue          text,
   scheduled_on   date
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select c.serial, c.candidate_name_snapshot, c.level, r.billing_stage,
         c.issued_on, s.venue, s.scheduled_on
  from public.certificates c
  left join public.assessment_results  r on r.certificate_id = c.id
  left join public.assessment_sessions s on s.id = r.session_id
  where public.has_role('chairperson') or public.has_role('board_member')
     or public.has_role('chief_examiner') or public.has_role('system_admin')
  order by c.created_at desc
  limit _limit;
$fn$;

grant execute on function public.list_issued_certificates(int) to authenticated;

-- A small count of passes still awaiting a certificate (will auto-issue when their
-- stage invoice clears) — informational, for the registry header.
create or replace function public.count_certs_awaiting()
 returns integer
 language sql stable security definer set search_path to ''
as $fn$
  select case when public.has_role('chairperson') or public.has_role('board_member')
                or public.has_role('chief_examiner') or public.has_role('system_admin')
              then (select count(*)::int from public.assessment_results
                    where outcome = 'pass' and certificate_id is null)
              else 0 end;
$fn$;

grant execute on function public.count_certs_awaiting() to authenticated;
