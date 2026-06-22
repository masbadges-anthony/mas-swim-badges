-- 20260622240000_list_sessions_overview.sql
--
-- list_sessions_overview(): one row per session with the denormalized names the
-- Accounts and InviteExaminer screens need (profiles is own-row-only, so this
-- must be a definer function). Returns invoice STATUS + booleans only — never
-- amounts — so it can be governance-readable without leaking billing figures.
-- The Accounts screen reads amounts separately via the system_admin-gated
-- invoices/invoice_items tables.
--
-- Governance gate matches list_memberships (chairperson/board_member/
-- chief_examiner). system_admin passes via the has_role() wildcard.

create or replace function public.list_sessions_overview()
returns table (
  session_id       uuid,
  status           session_status,
  venue            text,
  scheduled_on     date,
  state            my_state,
  instructor_name  text,
  centre_name      text,
  examiner_name    text,
  candidate_count  bigint,
  invited_count    bigint,
  invoice_status   text,
  invoice_paid     boolean,
  payout_recorded  boolean
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    s.id, s.status, s.venue, s.scheduled_on, s.state,
    ip.full_name, pc.name, ep.full_name,
    (select count(*) from public.assessment_results r where r.session_id = s.id),
    (select count(*) from public.session_invitations i
       where i.session_id = s.id and i.status = 'invited'),
    inv.status,
    coalesce(inv.status = 'paid', false),
    exists (select 1 from public.payments p
              where p.session_id = s.id and p.direction = 'payout')
  from public.assessment_sessions s
  left join public.profiles        ip on ip.id = s.requested_by_profile_id
  left join public.partner_centers pc on pc.id = s.partner_center_id
  left join public.profiles        ep on ep.id = s.examiner_profile_id
  left join public.invoices        inv on inv.session_id = s.id
  where public.has_role('chairperson')
     or public.has_role('board_member')
     or public.has_role('chief_examiner')
  order by s.created_at desc;
$function$;
