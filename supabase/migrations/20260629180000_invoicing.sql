-- 20260629180000_invoicing.sql  (ADAPT — supersedes the greenfield version)
-- #12 Assessment Workflow Redesign — migration 5 of N.
--
-- An invoicing scaffold already existed (invoices / invoice_items / payments), built for ONE
-- invoice per session with text+CHECK vocabularies. This migration adapts it to the 2-stage model
-- with the minimum surgery — only `invoices` is touched:
--   * drop UNIQUE(session_id)            -- it blocks a second (bonus) invoice per session
--   * add `stage` (booked_prepay|bonus_reconcile)  -- the 2-stage discriminator
--   * add `adjustments`                  -- signed discounts/credits
--   * add partial UNIQUE(session_id, stage) WHERE status <> 'void'  -- one live invoice per stage
-- The booked-vs-bonus split rides on invoices.stage; invoice_items stay item_type='assessment_fee'.
-- Existing RLS is left intact (audited separately).
--
-- IDEMPOTENT throughout.

-- Clean up the orphan enums a prior failed run may have created (scaffold uses text+CHECK, not enums).
drop type if exists invoice_stage;
drop type if exists invoice_status;
drop type if exists payment_direction;

-- (1) Remove the one-invoice-per-session lock.
alter table public.invoices drop constraint if exists invoices_session_id_key;

-- (2) Stage discriminator (text + CHECK, matching the scaffold's status/direction style).
alter table public.invoices add column if not exists stage text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass and conname = 'invoices_stage_check'
  ) then
    alter table public.invoices
      add constraint invoices_stage_check check (stage in ('booked_prepay', 'bonus_reconcile'));
  end if;
end $$;

-- 0 rows today, so SET NOT NULL is safe; no-op on re-run.
alter table public.invoices alter column stage set not null;

-- (3) Adjustments (signed). total stays a maintained column; the billing fn sets subtotal+adjustments+total.
alter table public.invoices add column if not exists adjustments numeric not null default 0;

-- (4) One live (non-void) invoice per (session, stage); voided ones can be reissued.
create unique index if not exists invoices_session_stage_live
  on public.invoices (session_id, stage)
  where status <> 'void';
