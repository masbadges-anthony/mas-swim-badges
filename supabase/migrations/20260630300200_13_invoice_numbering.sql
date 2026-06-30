-- #13 unit 1c — gapless invoice numbering (INV{MMYY}-serial) in invoices.receipt_no.
-- #13 unit 1, step 3 of 3 — gapless invoice numbering.
-- Format INV{MMYY}-{serial}, e.g. INV0626-00042. MMYY is the issue month (not a
-- reset boundary); the serial is one continuous, never-resetting, gapless series
-- shared across ALL invoices (assessment + centre billing share the invoices table).
-- Gapless (vs a bare sequence) because a rolled-back insert must not burn a number
-- — audit integrity. A single-row counter, locked and bumped in the same
-- transaction as the invoice insert, guarantees no gaps. The number lives in the
-- existing invoices.receipt_no column (no new column).

-- 3a. The counter. One row, holds the last serial issued.
create table if not exists public.invoice_counter (
  id          boolean primary key default true,
  last_serial bigint  not null default 0,
  constraint invoice_counter_singleton check (id)
);
insert into public.invoice_counter (id, last_serial)
values (true, 0)
on conflict (id) do nothing;

-- 3b. Allocator: locks the counter row, increments, returns the formatted number.
-- SECURITY DEFINER so it can run inside invoice-creating functions regardless of
-- the caller's table privileges; not granted to clients directly.
create or replace function public.next_invoice_no()
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_serial bigint;
begin
  update public.invoice_counter
     set last_serial = last_serial + 1
   where id = true
  returning last_serial into v_serial;

  -- INV + MMYY (issue month) + '-' + zero-padded continuous serial.
  return 'INV' || to_char(now(), 'MMYY') || '-' || lpad(v_serial::text, 5, '0');
end;
$function$;

-- Not granted to authenticated: only invoice-creating definer functions call it.
revoke all on function public.next_invoice_no() from public, authenticated;
