-- #13 unit 6 — list_my_sessions (instructor session list + checkpoint signals).

-- #13 unit 6 — instructor "My sessions" read: the missing instructor-facing list.
-- Returns the caller's booked sessions with the six checkpoint signals (derived),
-- their invoice state, and the assigned examiner's contact once claimed.

create or replace function public.list_my_sessions()
 returns table(
   session_id     uuid,
   venue          text,
   state          public.my_state,
   scheduled_on   date,
   status         public.session_status,
   receipt_no     text,
   invoice_status text,
   cp_created     boolean,   -- 1. session exists
   cp_roster      boolean,   -- 2. roster confirmed (enrolments present)
   cp_paid        boolean,   -- 3. booked-prepay invoice paid
   cp_examiner    boolean,   -- 4. examiner assigned
   cp_completed   boolean,   -- 5. results submitted
   cp_certs       boolean,   -- 6. all passing results certified
   examiner_name  text,
   examiner_phone text,
   examiner_email text
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
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
    ex.full_name, ex.phone, ex.email
  from public.assessment_sessions s
  left join lateral (
    select i.receipt_no, i.status
    from public.invoices i
    where i.session_id = s.id and i.stage = 'booked_prepay'
    order by i.created_at desc
    limit 1
  ) inv on true
  left join public.profiles ex on ex.id = s.examiner_profile_id
  where s.requested_by_profile_id = (select auth.uid())
  order by s.scheduled_on nulls last, s.id;
$fn$;

grant execute on function public.list_my_sessions() to authenticated;
