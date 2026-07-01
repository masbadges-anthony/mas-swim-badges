-- Backfill receipts for invoices that were marked paid BEFORE receipt-minting existed.
-- One receipt per paid invoice that doesn't already have one. Uses the gapless RCP series.
insert into public.receipts (receipt_no, invoice_id, amount, method, reference, issued_to, recorded_by)
select
  public.next_receipt_no(),
  i.id,
  i.total,
  (select p.method from public.payments p
     where p.invoice_id = i.id and p.direction = 'inbound'
     order by p.recorded_at desc limit 1),
  (select p.reference from public.payments p
     where p.invoice_id = i.id and p.direction = 'inbound'
     order by p.recorded_at desc limit 1),
  i.bill_to_profile_id,
  null
from public.invoices i
where i.status = 'paid'
  and not exists (select 1 from public.receipts r where r.invoice_id = i.id);

-- show what now exists
select r.receipt_no, i.receipt_no as invoice_no, r.amount, r.created_at
from public.receipts r
join public.invoices i on i.id = r.invoice_id
order by r.created_at desc;
