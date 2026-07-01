-- #15 unit 1 — universal role-scoped session tracker.
-- Governance (chairperson/system_admin/finance_officer/chief_examiner) see ALL sessions.
-- Everyone else sees sessions they booked OR are assigned to assess.
-- Same checkpoint signals + invoice state + both-way contacts for all.

create or replace function public.list_session_tracker()
 returns table(
   session_id     uuid,
   venue          text,
   state          public.my_state,
   scheduled_on   date,
   status         public.session_status,
   receipt_no     text,
   invoice_status text,
   cp_created     boolean,
   cp_roster      boolean,
   cp_paid        boolean,
   cp_examiner    boolean,
   cp_completed   boolean,
   cp_certs       boolean,
   candidate_count integer,
   booker_name    text,
   booker_phone   text,
   booker_email   text,
   examiner_name  text,
   examiner_phone text,
   examiner_email text,
   is_mine_booked   boolean,
   is_mine_assigned boolean
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  with me as (
    select (select auth.uid()) as uid,
           (public.has_role('chairperson') or public.has_role('system_admin')
            or public.has_role('finance_officer') or public.has_role('chief_examiner')
            or public.has_role('board_member')) as gov
  )
  select
    s.id, s.venue, s.state, s.scheduled_on, s.status,
    inv.receipt_no, inv.status,
    true,
    exists (select 1 from public.session_enrolments e where e.session_id = s.id),
    (inv.status = 'paid'),
    (s.examiner_profile_id is not null),
    (s.status in ('completed','closed','archived')),
    (    exists (select 1 from public.assessment_results r
                  where r.session_id = s.id and r.outcome = 'pass')
     and not exists (select 1 from public.assessment_results r
                  where r.session_id = s.id and r.outcome = 'pass' and r.certificate_id is null)),
    (select count(*)::int from public.session_enrolments e where e.session_id = s.id),
    bk.full_name, bk.phone, bk.email,
    ex.full_name, ex.phone, ex.email,
    (s.requested_by_profile_id = me.uid),
    (s.examiner_profile_id = me.uid)
  from public.assessment_sessions s
  cross join me
  left join lateral (
    select i.receipt_no, i.status
    from public.invoices i
    where i.session_id = s.id and i.stage = 'booked_prepay'
    order by i.created_at desc
    limit 1
  ) inv on true
  left join public.profiles bk on bk.id = s.requested_by_profile_id
  left join public.profiles ex on ex.id = s.examiner_profile_id
  where me.gov
     or s.requested_by_profile_id = me.uid
     or s.examiner_profile_id = me.uid
  order by s.scheduled_on nulls last, s.created_at desc;
$fn$;

grant execute on function public.list_session_tracker() to authenticated;
