-- 20260721160000_fix_cp_certs_all_billing_stages.sql
--
-- Fix #2 — Certificate progress bar bug.
--
-- Root cause: list_session_tracker.cp_certs derivation filtered on
-- billing_stage = 'booked', so pass rows in the 'bonus' billing stage were
-- invisible to the "no missing certs" check. Result: cp_certs flipped true
-- when all booked-stage passes had certificates, even when bonus-stage passes
-- were still uncertificated. Conversely, if a session had only bonus passes
-- (edge case), cp_certs stayed false forever.
--
-- Fix: remove the billing_stage filter from both existence checks. cp_certs
-- is now true iff (there is at least one pass in the session) AND (every
-- pass row has a certificate_id). Applies uniformly across booked and bonus.
--
-- Nothing else in the function body changes — same return signature, same
-- viewer gates, same remarks visibility, same booker/examiner contact rules.

create or replace function public.list_session_tracker()
 returns table (
   session_id uuid, venue text, state public.my_state, scheduled_on date,
   status public.session_status, receipt_no text, invoice_status text,
   cp_created boolean, cp_roster boolean, cp_paid boolean, cp_examiner boolean,
   cp_completed boolean, cp_certs boolean,
   candidate_count integer,
   booker_name text, booker_phone text, booker_email text,
   examiner_name text, examiner_phone text, examiner_email text,
   is_mine_booked boolean, is_mine_assigned boolean,
   instructor_remarks text, examiner_remarks text,
   rescheduled_from date, reschedule_count integer, weather_reason text
 )
 language sql
 stable security definer
 set search_path to ''
as $function$
  with me as (
    select
      (select auth.uid()) as uid,
      (select email from public.profiles where id = (select auth.uid())) as email,
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
    -- cp_certs — FIXED: no longer filters on billing_stage='booked'.
    -- True iff every pass row (across all billing stages) has a certificate.
    (    exists (select 1 from public.assessment_results r
                  where r.session_id = s.id
                    and r.outcome = 'pass')
     and not exists (select 1 from public.assessment_results r
                  where r.session_id = s.id
                    and r.outcome = 'pass'
                    and r.certificate_id is null)),
    (select count(*)::int from public.session_enrolments e where e.session_id = s.id),

    -- Names: always visible.
    bk.full_name,
    case when sc.is_gov or sc.is_booker then bk.phone else null end,
    case when sc.is_gov or sc.is_booker then bk.email else null end,

    ex.full_name,
    case when sc.is_gov or sc.is_examiner then ex.phone else null end,
    case when sc.is_gov or sc.is_examiner then ex.email else null end,

    (s.requested_by_profile_id = me.uid),
    (s.examiner_profile_id = me.uid),

    case when sc.has_role_on_session then s.instructor_remarks else null end,
    case when sc.has_role_on_session then s.examiner_remarks   else null end,

    s.rescheduled_from,
    s.reschedule_count,

    case when sc.has_role_on_session then s.weather_reason else null end

  from public.assessment_sessions s
  cross join me
  left join lateral (
    select
      me.gov                              as is_gov,
      (s.requested_by_profile_id = me.uid) as is_booker,
      (s.examiner_profile_id     = me.uid) as is_examiner,
      (
        s.partner_center_id is not null
        and exists (
          select 1 from public.memberships m
          where m.profile_id = me.uid
            and m.status = 'active'
            and m.role in ('partner_center_admin', 'instructor')
            and m.partner_center_id = s.partner_center_id
        )
      )                                    as is_centre
  ) base on true
  left join lateral (
    select
      base.is_gov, base.is_booker, base.is_examiner, base.is_centre,
      (base.is_gov or base.is_booker or base.is_examiner or base.is_centre)
        as has_role_on_session
  ) sc on true
  left join lateral (
    select i.receipt_no, i.status
    from public.invoices i
    where i.session_id = s.id and i.stage = 'booked_prepay'
    order by i.created_at desc
    limit 1
  ) inv on true
  left join public.profiles bk on bk.id = s.requested_by_profile_id
  left join public.profiles ex on ex.id = s.examiner_profile_id
  where
    me.gov
    or s.requested_by_profile_id = me.uid
    or s.examiner_profile_id     = me.uid
    or (
      s.partner_center_id is not null
      and exists (
        select 1 from public.memberships m
        where m.profile_id = me.uid
          and m.status = 'active'
          and m.role in ('partner_center_admin', 'instructor')
          and m.partner_center_id = s.partner_center_id
      )
    )
    or (
      me.email is not null
      and exists (
        select 1
        from public.session_enrolments se
        join public.candidates c on c.id = se.candidate_id
        where se.session_id = s.id
          and lower(c.parent_email) = lower(me.email)
      )
    )
  order by s.scheduled_on nulls last, s.created_at desc;
$function$;
