-- #13 unit 3b — list_billing_invoices + count_outstanding_invoices.

-- #13 unit 3b — billing-screen read functions (for the dedicated Invoices & Payments
-- screen + its nav count badge). Billing roles only: finance_officer/system_admin/chairperson.
-- Definer functions so the screen reads exactly what it needs without leaning on raw-table RLS.

-- 1. The billing list: every assessment invoice with session context + settlement state.
create or replace function public.list_billing_invoices()
 returns table(
   invoice_id    uuid,
   receipt_no    text,
   stage         text,
   status        text,
   total         numeric,
   paid_to_date  numeric,
   outstanding   numeric,
   session_id    uuid,
   venue         text,
   scheduled_on  date,
   session_status public.session_status,
   bill_to_name  text,
   created_at    timestamptz
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select
    i.id, i.receipt_no, i.stage, i.status, i.total,
    coalesce((select sum(p.amount) from public.payments p
              where p.invoice_id = i.id and p.direction = 'inbound'), 0) as paid_to_date,
    i.total - coalesce((select sum(p.amount) from public.payments p
              where p.invoice_id = i.id and p.direction = 'inbound'), 0) as outstanding,
    i.session_id, s.venue, s.scheduled_on, s.status,
    pr.full_name, i.created_at
  from public.invoices i
  left join public.assessment_sessions s on s.id = i.session_id
  left join public.profiles pr on pr.id = i.bill_to_profile_id
  where public.has_role('finance_officer') or public.has_role('system_admin')
        or public.has_role('chairperson')
  order by (i.status in ('pro_forma','issued')) desc, i.created_at desc;
$fn$;

grant execute on function public.list_billing_invoices() to authenticated;

-- 2. The nav-badge count: how many invoices still need a payment action (unpaid, not void).
create or replace function public.count_outstanding_invoices()
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select case
    when public.has_role('finance_officer') or public.has_role('system_admin')
         or public.has_role('chairperson')
    then (select count(*)::int from public.invoices i where i.status in ('pro_forma','issued'))
    else 0
  end;
$fn$;

grant execute on function public.count_outstanding_invoices() to authenticated;
