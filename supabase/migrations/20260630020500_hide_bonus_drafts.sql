-- #14 unit 2b — hide unissued bonus drafts from the instructor's invoice list.
-- A bonus invoice is a pro_forma DRAFT (no number) until the Finance Officer issues it.
-- The booked estimate (booked_prepay + pro_forma, but numbered) stays visible, as do
-- all issued/paid invoices. Only the unissued bonus draft is hidden.
-- Identical to the live function, plus the one NOT(...) clause.
create or replace function public.list_my_invoices()
 returns table(invoice_id uuid, session_id uuid, status text, total numeric, currency text,
               receipt_no text, paid_at timestamp with time zone, venue text,
               scheduled_on date, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select i.id, i.session_id, i.status, i.total, i.currency, i.receipt_no, i.paid_at,
         s.venue, s.scheduled_on, i.created_at
  from public.invoices i
  join public.assessment_sessions s on s.id = i.session_id
  where (i.bill_to_profile_id = (select auth.uid())
         or (i.partner_center_id is not null
             and public.has_role('partner_center_admin', i.partner_center_id)))
    and not (i.stage = 'bonus_reconcile' and i.status = 'pro_forma')
  order by i.created_at desc;
$function$;
