-- #13 unit 3 — record_payment auth widen to billing roles + invoices/payments RLS.

-- #13 unit 3 — Finance Officer billing authority.
-- Billing roles are exactly: finance_officer, system_admin, chairperson (per spec §4).
-- This widens record_payment's internal check AND the invoices/payments RLS to those
-- three. It also removes chief_examiner and board_member from payment authority — the
-- examiner stream and general board should not record money (role-ownership line).

-- 1. record_payment: re-create with the corrected billing-role check. Body unchanged
--    except the authorization line.
create or replace function public.record_payment(
  _invoice_id uuid, _amount numeric, _method text default null, _reference text default null)
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
  v_paid_sum   numeric;
  v_new_status text;
begin
  if not (public.has_role('finance_officer') or public.has_role('system_admin')
       or public.has_role('chairperson')) then
    raise exception 'not authorized to record payments' using errcode = 'insufficient_privilege';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'amount must be positive' using errcode = 'check_violation';
  end if;

  select session_id, bill_to_profile_id, total, status
    into v_session, v_bill_to, v_total, v_status
    from public.invoices
   where id = _invoice_id;

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

  select coalesce(sum(amount), 0)
    into v_paid_sum
    from public.payments
   where invoice_id = _invoice_id and direction = 'inbound';

  if v_paid_sum >= v_total then
    v_new_status := 'paid';
    update public.invoices set status = 'paid', paid_at = now() where id = _invoice_id;
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

-- 2. RLS: widen the billing policies from system_admin-only to the three billing roles.

-- invoices SELECT: keep bill-to + centre-admin branches; widen the admin branch.
drop policy if exists invoices_select_visible on public.invoices;
create policy invoices_select_visible on public.invoices
for select using (
  (bill_to_profile_id = (select auth.uid()))
  or ((partner_center_id is not null) and public.has_role('partner_center_admin', partner_center_id))
  or public.has_role('system_admin')
  or public.has_role('finance_officer')
  or public.has_role('chairperson')
);

-- invoices INSERT
drop policy if exists invoices_insert_admin on public.invoices;
create policy invoices_insert_admin on public.invoices
for insert with check (
  public.has_role('system_admin') or public.has_role('finance_officer') or public.has_role('chairperson')
);

-- invoices UPDATE
drop policy if exists invoices_update_admin on public.invoices;
create policy invoices_update_admin on public.invoices
for update using (
  public.has_role('system_admin') or public.has_role('finance_officer') or public.has_role('chairperson')
);

-- payments: admin ALL widened; keep the bill-to SELECT branch as-is.
drop policy if exists payments_all_admin on public.payments;
create policy payments_all_admin on public.payments
for all using (
  public.has_role('system_admin') or public.has_role('finance_officer') or public.has_role('chairperson')
) with check (
  public.has_role('system_admin') or public.has_role('finance_officer') or public.has_role('chairperson')
);
