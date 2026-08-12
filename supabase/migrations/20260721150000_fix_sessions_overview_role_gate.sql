-- 20260721150000_fix_sessions_overview_role_gate.sql
--
-- Fix #5 — Accounts.tsx payout view shows sessions as 'unassigned' even when
-- examiners are assigned.
--
-- Root cause: list_sessions_overview's WHERE clause gated the whole function
-- to chairperson / board_member / chief_examiner only. When Accounts.tsx is
-- viewed by a Finance Officer or sysadmin, the query returns zero rows, so
-- the UI has no data to display — presenting as 'unassigned' or blank.
--
-- Fix: broaden the WHERE to include finance_officer and system_admin. Both
-- need read access to the sessions overview to record payouts, review payment
-- status, and audit. Read scope only — this function returns no PII sensitive
-- to parents.

create or replace function public.list_sessions_overview()
 returns table (
   session_id uuid, status public.session_status, venue text, scheduled_on date,
   state public.my_state, instructor_name text, centre_name text, examiner_name text,
   candidate_count bigint, invited_count bigint, invoice_status text,
   invoice_paid boolean, payout_recorded boolean,
   instructor_remarks text, examiner_remarks text
 )
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    s.id, s.status, s.venue, s.scheduled_on, s.state,
    coalesce(ip.full_name, ip.email),
    pc.name,
    coalesce(ep.full_name, ep.email),
    (select count(*) from public.assessment_results r where r.session_id = s.id),
    (select count(*) from public.session_invitations i
       where i.session_id = s.id and i.status = 'invited'),
    inv.status,
    coalesce(inv.status = 'paid', false),
    exists (select 1 from public.payments p
              where p.session_id = s.id and p.direction = 'payout'),
    case
      when s.requested_by_profile_id = auth.uid()
        or s.examiner_profile_id     = auth.uid()
        or public.has_role('chairperson')
        or public.has_role('board_member')
        or public.has_role('chief_examiner')
        or public.has_role('finance_officer')
        or public.has_role('system_admin')
      then s.instructor_remarks
      else null
    end as instructor_remarks,
    case
      when s.requested_by_profile_id = auth.uid()
        or s.examiner_profile_id     = auth.uid()
        or public.has_role('chairperson')
        or public.has_role('board_member')
        or public.has_role('chief_examiner')
        or public.has_role('finance_officer')
        or public.has_role('system_admin')
      then s.examiner_remarks
      else null
    end as examiner_remarks
  from public.assessment_sessions s
  left join public.profiles        ip on ip.id = s.requested_by_profile_id
  left join public.partner_centers pc on pc.id = s.partner_center_id
  left join public.profiles        ep on ep.id = s.examiner_profile_id
  left join lateral (
    select i.status
    from public.invoices i
    where i.session_id = s.id and i.stage = 'booked_prepay'
    order by i.created_at desc
    limit 1
  ) inv on true
  where public.has_role('chairperson')
     or public.has_role('board_member')
     or public.has_role('chief_examiner')
     or public.has_role('finance_officer')     -- NEW: FO needs to see payout view
     or public.has_role('system_admin')        -- NEW: sysadmin needs to see everything
  order by s.created_at desc;
$function$;
