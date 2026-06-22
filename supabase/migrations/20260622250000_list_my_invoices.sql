-- 20260622250000_list_my_invoices.sql
--
-- list_my_invoices(): the caller's own invoices, joined to session context
-- (venue/date). Scoped in the WHERE to the bill-to instructor OR a centre admin
-- of the invoice's centre — so an instructor sees only their own. Definer so it
-- can read the session row regardless of assessment_sessions RLS; ownership is
-- enforced here, not by RLS. Line items are read separately by the client
-- (invoice_items RLS already exposes them for a visible invoice).

create or replace function public.list_my_invoices()
returns table (
  invoice_id   uuid,
  session_id   uuid,
  status       text,
  total        numeric,
  currency     text,
  receipt_no   text,
  paid_at      timestamptz,
  venue        text,
  scheduled_on date,
  created_at   timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select i.id, i.session_id, i.status, i.total, i.currency, i.receipt_no, i.paid_at,
         s.venue, s.scheduled_on, i.created_at
  from public.invoices i
  join public.assessment_sessions s on s.id = i.session_id
  where i.bill_to_profile_id = (select auth.uid())
     or (i.partner_center_id is not null
         and public.has_role('partner_center_admin', i.partner_center_id))
  order by i.created_at desc;
$function$;
