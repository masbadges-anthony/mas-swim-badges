-- session_4401917e_bonus_certs.sql
-- Diagnostic for session 4401917e-7ceb-4b4f-ba9d-5d660f078a8a
--
-- The cp_certs fix (20260721160000) correctly flagged this session as
-- incomplete: 3 outstanding bonus certificates surfaced (2 Sea Turtle + 1
-- Guppy). This script dumps everything needed to decide *why*:
--   a. bonus invoice never created         → look at fee_schedule + bill_to
--   b. bonus invoice created but unpaid    → normal state; FO action needed
--   c. bonus invoice paid, certs still nil → auto-issue silently skipped;
--                                            handle by direct helper call
--   d. wrong billing_stage on the results  → data-integrity fix required
--
-- Run in Supabase SQL editor. Prefix `reset role;` in the editor before
-- pasting (per house convention) — not persisted in the committed file.

-- ---------------------------------------------------------------------------
-- Q1 · Session header
-- ---------------------------------------------------------------------------
select
  id,
  venue,
  state,
  scheduled_on,
  status,
  requested_by_profile_id,
  examiner_profile_id,
  partner_center_id,
  created_at
from public.assessment_sessions
where id = '4401917e-7ceb-4b4f-ba9d-5d660f078a8a';

-- ---------------------------------------------------------------------------
-- Q2 · Every result row on the session — outcome, stage, cert linkage
--       This is the ground truth. Any 'pass' row with certificate_id = null
--       is a missing certificate.
-- ---------------------------------------------------------------------------
select
  r.id                as result_id,
  r.enrolment_id,
  r.candidate_id,
  c.full_name         as candidate_name,
  r.target_level,
  r.outcome,
  r.billing_stage,
  r.fee_rm_snapshot,
  r.certificate_id,
  cert.serial         as cert_serial,
  cert.issued_on,
  r.created_at
from public.assessment_results r
left join public.candidates c   on c.id = r.candidate_id
left join public.certificates cert on cert.id = r.certificate_id
where r.session_id = '4401917e-7ceb-4b4f-ba9d-5d660f078a8a'
order by r.billing_stage, r.target_level, c.full_name;

-- ---------------------------------------------------------------------------
-- Q3 · Every invoice on the session — stage, status, totals, payments
-- ---------------------------------------------------------------------------
select
  i.id                as invoice_id,
  i.stage,
  i.status,
  i.receipt_no,
  i.bill_to_profile_id,
  i.partner_center_id,
  i.subtotal,
  i.total,
  i.paid_at,
  i.created_at,
  (select coalesce(sum(amount), 0)
     from public.payments p
    where p.invoice_id = i.id and p.direction = 'inbound') as paid_to_date
from public.invoices i
where i.session_id = '4401917e-7ceb-4b4f-ba9d-5d660f078a8a'
order by i.created_at;

-- ---------------------------------------------------------------------------
-- Q4 · Invoice line items — confirms bonus items are correctly generated
-- ---------------------------------------------------------------------------
select
  ii.invoice_id,
  i.stage,
  i.status,
  ii.item_type,
  ii.description,
  ii.level,
  ii.candidate_id,
  ii.quantity,
  ii.unit_amount,
  ii.amount
from public.invoice_items ii
join public.invoices i on i.id = ii.invoice_id
where i.session_id = '4401917e-7ceb-4b4f-ba9d-5d660f078a8a'
order by i.created_at, ii.level;

-- ---------------------------------------------------------------------------
-- Q5 · Every payment recorded against the session's invoices
-- ---------------------------------------------------------------------------
select
  p.id           as payment_id,
  p.invoice_id,
  i.stage,
  p.direction,
  p.amount,
  p.method,
  p.reference,
  p.recorded_by_profile_id,
  p.created_at
from public.payments p
join public.invoices i on i.id = p.invoice_id
where i.session_id = '4401917e-7ceb-4b4f-ba9d-5d660f078a8a'
order by p.created_at;

-- ---------------------------------------------------------------------------
-- Q6 · Compact scorecard — one row summary
-- ---------------------------------------------------------------------------
with base as (
  select id from public.assessment_sessions
   where id = '4401917e-7ceb-4b4f-ba9d-5d660f078a8a'
)
select
  b.id as session_id,
  (select count(*) from public.assessment_results r
    where r.session_id = b.id and r.outcome = 'pass' and r.billing_stage = 'booked')
      as booked_passes,
  (select count(*) from public.assessment_results r
    where r.session_id = b.id and r.outcome = 'pass' and r.billing_stage = 'booked'
      and r.certificate_id is null)
      as booked_passes_missing_certs,
  (select count(*) from public.assessment_results r
    where r.session_id = b.id and r.outcome = 'pass' and r.billing_stage = 'bonus')
      as bonus_passes,
  (select count(*) from public.assessment_results r
    where r.session_id = b.id and r.outcome = 'pass' and r.billing_stage = 'bonus'
      and r.certificate_id is null)
      as bonus_passes_missing_certs,
  (select stage || ':' || status
     from public.invoices
    where session_id = b.id and stage = 'booked_prepay'
    order by created_at desc limit 1) as booked_invoice_state,
  (select stage || ':' || status
     from public.invoices
    where session_id = b.id and stage = 'bonus_reconcile'
    order by created_at desc limit 1) as bonus_invoice_state
from base b;
