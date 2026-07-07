-- 20260707120000_parent_redaction_session_tracker.sql
-- W2-4 · Parent-facing privacy redaction in list_session_tracker.
--
-- Leak closed: a viewer matched ONLY via the parent_email branch previously
-- received full booker/examiner phone+email and both remarks fields. Only
-- weather_reason was gated. This migration adds field-level redaction that
-- reuses the same relationship signals already computed for the row filter.
--
-- Redaction doctrine (Open TODO #6/#7/#8):
--   * Contact (phone/email)  -> owner + governance only. Hides examiner_email
--                               from instructors and parents alike.
--   * instructor_remarks     -> any real role on the session (gov/booker/
--     examiner_remarks           examiner/centre); NOT parent-only viewers.
--   * Names                  -> unchanged (not sensitive; appear on rosters).
--
-- Return type is unchanged (values nulled, columns intact) -> no DROP FUNCTION.

CREATE OR REPLACE FUNCTION public.list_session_tracker()
 RETURNS TABLE(session_id uuid, venue text, state my_state, scheduled_on date, status session_status, receipt_no text, invoice_status text, cp_created boolean, cp_roster boolean, cp_paid boolean, cp_examiner boolean, cp_completed boolean, cp_certs boolean, candidate_count integer, booker_name text, booker_phone text, booker_email text, examiner_name text, examiner_phone text, examiner_email text, is_mine_booked boolean, is_mine_assigned boolean, instructor_remarks text, examiner_remarks text, rescheduled_from date, reschedule_count integer, weather_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    (    exists (select 1 from public.assessment_results r
                  where r.session_id = s.id
                    and r.outcome = 'pass'
                    and r.billing_stage = 'booked')
     and not exists (select 1 from public.assessment_results r
                  where r.session_id = s.id
                    and r.outcome = 'pass'
                    and r.billing_stage = 'booked'
                    and r.certificate_id is null)),
    (select count(*)::int from public.session_enrolments e where e.session_id = s.id),

    -- Names: always visible.
    bk.full_name,
    -- Booker contact: owner (booker) + governance only.
    case when sc.is_gov or sc.is_booker then bk.phone else null end,
    case when sc.is_gov or sc.is_booker then bk.email else null end,

    ex.full_name,
    -- Examiner contact: owner (examiner) + governance only.
    -- Explicitly withheld from instructors/booker/parents (TODO #8).
    case when sc.is_gov or sc.is_examiner then ex.phone else null end,
    case when sc.is_gov or sc.is_examiner then ex.email else null end,

    (s.requested_by_profile_id = me.uid),
    (s.examiner_profile_id = me.uid),

    -- Remarks: any real role on the session; hidden from parent-only viewers.
    case when sc.has_role_on_session then s.instructor_remarks else null end,
    case when sc.has_role_on_session then s.examiner_remarks   else null end,

    s.rescheduled_from,
    s.reschedule_count,

    -- weather_reason gate unchanged, now sourced from the shared flags.
    case when sc.has_role_on_session then s.weather_reason else null end

  from public.assessment_sessions s
  cross join me
  -- Compute the viewer's relationship to THIS row once; reuse for every gate.
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
