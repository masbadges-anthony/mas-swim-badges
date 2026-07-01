-- #14 unit 3 — printable invoice + receipt documents.
-- Adds: gapless receipt numbering (RCP{MMYY}-serial), a receipts record minted on full
-- payment, a single-invoice document read, and a receipts-for-invoice read.

-- ---------------------------------------------------------------------------------
-- (1) gapless receipt counter + next_receipt_no()  (mirrors the invoice counter)
-- ---------------------------------------------------------------------------------
create table if not exists public.receipt_counter (
  period text primary key,         -- 'MMYY'
  last_serial integer not null default 0
);

create or replace function public.next_receipt_no()
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_period text := to_char(now(), 'MMYY');
  v_serial integer;
begin
  insert into public.receipt_counter (period, last_serial)
  values (v_period, 1)
  on conflict (period) do update set last_serial = public.receipt_counter.last_serial + 1
  returning last_serial into v_serial;
  return 'RCP' || v_period || '-' || lpad(v_serial::text, 5, '0');
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (2) receipts record — one per payment that fully settles an invoice.
-- ---------------------------------------------------------------------------------
create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text not null unique,
  invoice_id    uuid not null references public.invoices(id),
  amount        numeric not null,
  method        text,
  reference     text,
  issued_to     uuid references public.profiles(id),
  recorded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

alter table public.receipts enable row level security;

-- billing roles + the bill-to instructor may read receipts
drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts
for select using (
  public.has_role('finance_officer') or public.has_role('system_admin')
  or public.has_role('chairperson')
  or issued_to = (select auth.uid())
);

drop policy if exists receipts_no_direct_write on public.receipts;
create policy receipts_no_direct_write on public.receipts
for all using (false) with check (false);

-- ---------------------------------------------------------------------------------
-- (3) fold receipt minting into record_payment — when an invoice becomes fully paid,
--     mint a receipt. (Carries forward the unit-14.1 pickup gate + bonus cert release.)
-- ---------------------------------------------------------------------------------
create or replace function public.record_payment(_invoice_id uuid, _amount numeric, _method text default null, _reference text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_session    uuid;
  v_bill_to    uuid;
  v_total      numeric;
  v_status     text;
  v_stage      text;
  v_paid_sum   numeric;
  v_new_status text;
  v_receipt_no text;
  v_already    boolean;
begin
  if not (public.has_role('finance_officer') or public.has_role('system_admin')
       or public.has_role('chairperson')) then
    raise exception 'not authorized to record payments' using errcode = 'insufficient_privilege';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'amount must be positive' using errcode = 'check_violation';
  end if;

  select session_id, bill_to_profile_id, total, status, stage
    into v_session, v_bill_to, v_total, v_status, v_stage
    from public.invoices where id = _invoice_id;

  if v_session is null then
    raise exception 'invoice not found';
  end if;
  if v_status = 'void' then
    raise exception 'cannot record payment against a void invoice' using errcode = 'check_violation';
  end if;

  insert into public.payments
    (direction, invoice_id, session_id, payee_profile_id, amount, method, reference, recorded_by_profile_id)
  values
    ('inbound', _invoice_id, v_session, v_bill_to, _amount, _method, _reference, (select auth.uid()));

  select coalesce(sum(amount), 0) into v_paid_sum
    from public.payments where invoice_id = _invoice_id and direction = 'inbound';

  if v_paid_sum >= v_total then
    v_new_status := 'paid';
    update public.invoices set status = 'paid', paid_at = now() where id = _invoice_id;

    if v_stage = 'booked_prepay' then
      update public.assessment_sessions
         set status = 'open_for_pickup'
       where id = v_session and status = 'awaiting_payment';
    end if;

    if v_stage = 'bonus_reconcile' then
      perform public._auto_issue_certs(v_session, 'bonus');
    end if;

    -- mint a receipt once, on first full settlement
    select exists(select 1 from public.receipts where invoice_id = _invoice_id) into v_already;
    if not v_already then
      v_receipt_no := public.next_receipt_no();
      insert into public.receipts (receipt_no, invoice_id, amount, method, reference, issued_to, recorded_by)
      values (v_receipt_no, _invoice_id, v_paid_sum, _method, _reference, v_bill_to, (select auth.uid()));
    end if;
  else
    v_new_status := 'issued';
    update public.invoices set status = 'issued' where id = _invoice_id and status = 'pro_forma';
  end if;

  return jsonb_build_object(
    'invoice_id', _invoice_id,
    'paid_to_date', v_paid_sum,
    'invoice_total', v_total,
    'status', v_new_status,
    'fully_paid', (v_paid_sum >= v_total));
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (4) get_invoice_document(_invoice_id) — one invoice with everything the A5 doc needs.
--     Visible to the bill-to instructor, the centre admin, or billing roles.
-- ---------------------------------------------------------------------------------
create or replace function public.get_invoice_document(_invoice_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $fn$
declare
  v jsonb;
  v_bill_to uuid;
  v_centre uuid;
begin
  select bill_to_profile_id, partner_center_id into v_bill_to, v_centre
    from public.invoices where id = _invoice_id;
  if v_bill_to is null and v_centre is null then
    raise exception 'invoice not found';
  end if;

  if not (v_bill_to = (select auth.uid())
          or public.has_role('finance_officer') or public.has_role('system_admin')
          or public.has_role('chairperson')
          or (v_centre is not null and public.has_role('partner_center_admin', v_centre))) then
    raise exception 'not authorized to view this invoice' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'invoice_no', i.receipt_no,
    'status', i.status,
    'stage', i.stage,
    'subtotal', i.subtotal,
    'total', i.total,
    'currency', i.currency,
    'issued_at', i.issued_at,
    'paid_at', i.paid_at,
    'created_at', i.created_at,
    'bill_to_name', pr.full_name,
    'bill_to_email', pr.email,
    'centre_name', pc.name,
    'venue', s.venue,
    'scheduled_on', s.scheduled_on,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'description', ii.description,
               'level', ii.level,
               'candidate_name', c.full_name,
               'quantity', ii.quantity,
               'unit_amount', ii.unit_amount,
               'amount', ii.amount) order by ii.created_at)
      from public.invoice_items ii
      left join public.candidates c on c.id = ii.candidate_id
      where ii.invoice_id = i.id), '[]'::jsonb)
  ) into v
  from public.invoices i
  left join public.profiles pr on pr.id = i.bill_to_profile_id
  left join public.partner_centers pc on pc.id = i.partner_center_id
  left join public.assessment_sessions s on s.id = i.session_id
  where i.id = _invoice_id;

  return v;
end;
$fn$;

grant execute on function public.get_invoice_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------------
-- (5) get_receipt_document(_invoice_id) — the receipt for a paid invoice (if any).
-- ---------------------------------------------------------------------------------
create or replace function public.get_receipt_document(_invoice_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $fn$
declare
  v jsonb;
  v_bill_to uuid;
  v_centre uuid;
begin
  select bill_to_profile_id, partner_center_id into v_bill_to, v_centre
    from public.invoices where id = _invoice_id;

  if not (v_bill_to = (select auth.uid())
          or public.has_role('finance_officer') or public.has_role('system_admin')
          or public.has_role('chairperson')
          or (v_centre is not null and public.has_role('partner_center_admin', v_centre))) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'receipt_no', r.receipt_no,
    'invoice_no', i.receipt_no,
    'amount', r.amount,
    'method', r.method,
    'reference', r.reference,
    'paid_at', i.paid_at,
    'created_at', r.created_at,
    'bill_to_name', pr.full_name,
    'centre_name', pc.name,
    'venue', s.venue,
    'scheduled_on', s.scheduled_on
  ) into v
  from public.receipts r
  join public.invoices i on i.id = r.invoice_id
  left join public.profiles pr on pr.id = i.bill_to_profile_id
  left join public.partner_centers pc on pc.id = i.partner_center_id
  left join public.assessment_sessions s on s.id = i.session_id
  where r.invoice_id = _invoice_id
  order by r.created_at desc
  limit 1;

  return v;  -- null if no receipt yet
end;
$fn$;

grant execute on function public.get_receipt_document(uuid) to authenticated;
