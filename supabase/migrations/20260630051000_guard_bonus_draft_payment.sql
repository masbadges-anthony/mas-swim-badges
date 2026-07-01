-- FIX — record_payment refuses an un-issued bonus draft.
-- A bonus_reconcile invoice that is still 'pro_forma' (a draft, no number) must be
-- issued by the FO ("Create invoice" → issue_bonus_invoice) BEFORE it can be paid.
-- This enforces the unit-2 flow at the data layer so it can't be skipped via the UI.
-- Everything else is carried forward unchanged from the unit-14.4 definition.
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

  -- GUARD: an un-issued bonus draft must be issued (numbered) before payment.
  if v_stage = 'bonus_reconcile' and v_status = 'pro_forma' then
    raise exception 'create the bonus invoice first (it must be issued before payment)'
      using errcode = 'check_violation';
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

    select exists(select 1 from public.receipts where invoice_id = _invoice_id) into v_already;
    if not v_already then
      v_receipt_no := public.next_receipt_no();
      insert into public.receipts (receipt_no, invoice_id, amount, method, reference, issued_to, recorded_by)
      values (v_receipt_no, _invoice_id, v_paid_sum, _method, _reference, v_bill_to, (select auth.uid()));
    end if;

    perform public.maybe_close_session(v_session);
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
