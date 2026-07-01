-- #14 unit 4 — stage-based lifecycle locking via auto-close.
-- The mutation guards already refuse on completed/closed/archived/cancelled
-- (mark_attendance, record_assessment_outcome, cancel_session, swap_session_examiner).
-- What was missing: the transition that SEALS a session. A completed session
-- auto-closes once fully settled — no passing result without a certificate, and no
-- unpaid (non-void) invoice. Closing locks it for everyone (FO/sysadmin override +
-- audit arrives in unit 5).

-- ---------------------------------------------------------------------------------
-- (0) maybe_close_session — internal; flips completed -> closed when fully settled.
--     Never raises; safe to call from submit / payment flows.
-- ---------------------------------------------------------------------------------
create or replace function public.maybe_close_session(_session_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_status public.session_status;
  v_settled boolean;
begin
  select status into v_status from public.assessment_sessions where id = _session_id;
  if v_status is distinct from 'completed' then
    return false;  -- only completed sessions auto-close
  end if;

  v_settled :=
    not exists (
      select 1 from public.assessment_results
      where session_id = _session_id and outcome = 'pass' and certificate_id is null
    )
    and not exists (
      select 1 from public.invoices
      where session_id = _session_id and status in ('pro_forma', 'issued')
    );

  if v_settled then
    update public.assessment_sessions set status = 'closed' where id = _session_id;
    return true;
  end if;
  return false;
end;
$fn$;

revoke execute on function public.maybe_close_session(uuid) from public;

-- ---------------------------------------------------------------------------------
-- (1) submit_session_results — unchanged behaviour + a close attempt at the end.
--     (If there are no bonus passes, the session settles and closes immediately.)
-- ---------------------------------------------------------------------------------
create or replace function public.submit_session_results(_session_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_examiner       uuid;
  v_bill_to        uuid;
  v_partner_center uuid;
  v_subtotal       numeric;
  v_invoice_id     uuid;
begin
  select examiner_profile_id, requested_by_profile_id, partner_center_id
    into v_examiner, v_bill_to, v_partner_center
    from public.assessment_sessions
   where id = _session_id;

  if v_examiner is null or v_examiner <> (select auth.uid()) then
    raise exception 'not authorized: caller is not the assigned examiner for session %', _session_id
      using errcode = 'insufficient_privilege';
  end if;

  update public.assessment_sessions
     set status = 'completed'
   where id = _session_id and status = 'claimed';

  perform public._auto_issue_certs(_session_id, 'booked');

  if not exists (
    select 1 from public.invoices
    where session_id = _session_id and stage = 'bonus_reconcile' and status <> 'void'
  ) then
    select coalesce(sum(coalesce(r.fee_rm_snapshot, f.fee_rm)), 0)
      into v_subtotal
      from public.assessment_results r
      left join public.fee_schedule f on f.level = r.target_level
     where r.session_id = _session_id and r.billing_stage = 'bonus' and r.outcome = 'pass';

    if v_bill_to is not null and v_subtotal > 0 then
      insert into public.invoices
        (session_id, stage, bill_to_profile_id, partner_center_id, status, subtotal, total)
      values
        (_session_id, 'bonus_reconcile', v_bill_to, v_partner_center, 'pro_forma', v_subtotal, v_subtotal)
      returning id into v_invoice_id;

      insert into public.invoice_items
        (invoice_id, item_type, description, level, candidate_id, quantity, unit_amount, amount)
      select v_invoice_id, 'assessment_fee',
        'Bonus level pass — ' || r.target_level::text,
        r.target_level, r.candidate_id, 1,
        coalesce(r.fee_rm_snapshot, f.fee_rm), coalesce(r.fee_rm_snapshot, f.fee_rm)
      from public.assessment_results r
      left join public.fee_schedule f on f.level = r.target_level
      where r.session_id = _session_id and r.billing_stage = 'bonus' and r.outcome = 'pass';
    end if;
  end if;

  -- seal the session if nothing remains to settle (no bonus passes => closes now)
  perform public.maybe_close_session(_session_id);

  return v_invoice_id;
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (2) record_payment — unchanged behaviour + a close attempt after settlement.
--     (Paying the bonus invoice issues bonus certs, then the session closes.)
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

    select exists(select 1 from public.receipts where invoice_id = _invoice_id) into v_already;
    if not v_already then
      v_receipt_no := public.next_receipt_no();
      insert into public.receipts (receipt_no, invoice_id, amount, method, reference, issued_to, recorded_by)
      values (v_receipt_no, _invoice_id, v_paid_sum, _method, _reference, v_bill_to, (select auth.uid()));
    end if;

    -- seal the session if this payment completed settlement
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
