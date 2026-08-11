-- 20260711100000_sessions_overview_remarks.sql
--
-- Extend list_sessions_overview() to return instructor_remarks and
-- examiner_remarks, redacted by viewer role:
--
--   instructor_remarks visible to:  the booking instructor (self)
--                                   the assigned examiner
--                                   governance (CH / BM / CE / FO / sysadmin)
--   examiner_remarks   visible to:  the booking instructor
--                                   the assigned examiner (self)
--                                   governance (CH / BM / CE / FO / sysadmin)
--
-- Parents / claimants and unrelated roles get NULL for both.
--
-- The function already gates the query itself to governance (see WHERE clause),
-- so the redaction is a belt-and-braces guard for the day the read gate widens.
-- Governance callers see everything today; the CASE expressions become active
-- once instructor/examiner are added to the outer gate in a later change.
--
-- Return-type change means the function must be DROPped first (42P13).

drop function if exists public.list_sessions_overview();

create or replace function public.list_sessions_overview()
returns table (
  session_id uuid,
  status public.session_status,
  venue text,
  scheduled_on date,
  state public.my_state,
  instructor_name text,
  centre_name text,
  examiner_name text,
  candidate_count bigint,
  invited_count bigint,
  invoice_status text,
  invoice_paid boolean,
  payout_recorded boolean,
  instructor_remarks text,
  examiner_remarks text
)
language sql
stable security definer
set search_path to ''
as $$
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
  order by s.created_at desc;
$$;

grant execute on function public.list_sessions_overview() to authenticated;
