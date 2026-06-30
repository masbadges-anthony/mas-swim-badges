-- #13 unit 5a — cancel_session, list_refunds_due, mark_refund_paid.

-- #13 unit 5a — cancellation + 72h refund + Finance Officer refund tracking.
-- Refund model: no schema change. A refund is a 'payout' payment tagged note='refund'
-- to the instructor. "Refund due" = session cancelled + booked-prepay invoice paid +
-- (sum inbound) > (sum refund payouts). Invoice status stays 'paid' (it WAS paid);
-- the refund is its own auditable money movement.

-- ---------------------------------------------------------------------------------
-- 1. cancel_session — instructor (or governance) cancels a session.
--    >72h before scheduled_on AND invoice paid  -> cancelled, refund obligation created.
--    <=72h                                       -> cancelled, forfeit (no refund).
--    Unpaid                                      -> cancelled, invoice voided (nothing to refund).
-- ---------------------------------------------------------------------------------
create or replace function public.cancel_session(_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_me        uuid := (select auth.uid());
  v_owner     uuid;
  v_status    public.session_status;
  v_scheduled date;
  v_inv_id    uuid;
  v_inv_status text;
  v_within72  boolean;
  v_refund_due boolean := false;
begin
  select requested_by_profile_id, status, scheduled_on
    into v_owner, v_status, v_scheduled
    from public.assessment_sessions
   where id = _session_id
   for update;

  if v_owner is null then
    raise exception 'session not found';
  end if;

  -- authorize: the booking instructor, or governance
  if v_owner <> v_me
     and not (public.has_role('chairperson') or public.has_role('board_member')
              or public.has_role('chief_examiner') or public.has_role('system_admin')) then
    raise exception 'not authorized to cancel this session' using errcode = 'insufficient_privilege';
  end if;

  if v_status in ('completed', 'closed', 'archived', 'cancelled') then
    raise exception 'session cannot be cancelled from status %', v_status using errcode = 'check_violation';
  end if;

  select id, status into v_inv_id, v_inv_status
    from public.invoices
   where session_id = _session_id and stage = 'booked_prepay'
   limit 1;

  v_within72 := (v_scheduled is not null and v_scheduled <= (current_date + 3));

  -- Cancel the session (this also removes it from the pickup pool, which only shows
  -- open_for_pickup).
  update public.assessment_sessions set status = 'cancelled' where id = _session_id;

  if v_inv_status = 'paid' then
    if v_within72 then
      v_refund_due := false;   -- forfeit
    else
      v_refund_due := true;    -- refund obligation; FO will process
    end if;
  elsif v_inv_id is not null and v_inv_status in ('pro_forma', 'issued') then
    update public.invoices set status = 'void' where id = v_inv_id;  -- nothing paid; void it
  end if;

  return jsonb_build_object(
    'session_id', _session_id,
    'status', 'cancelled',
    'within_72h', v_within72,
    'refund_due', v_refund_due);
end;
$fn$;

grant execute on function public.cancel_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------------
-- 2. list_refunds_due — billing-role read: cancelled sessions whose paid invoice
--    has an unfulfilled refund. Drives the FO "refund due" surface.
-- ---------------------------------------------------------------------------------
create or replace function public.list_refunds_due()
 returns table(
   invoice_id   uuid,
   receipt_no   text,
   session_id   uuid,
   venue        text,
   scheduled_on date,
   bill_to_id   uuid,
   bill_to_name text,
   paid_amount  numeric,
   refunded     numeric,
   refund_due   numeric
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select
    i.id, i.receipt_no, i.session_id, s.venue, s.scheduled_on,
    i.bill_to_profile_id, pr.full_name,
    coalesce((select sum(p.amount) from public.payments p
              where p.invoice_id = i.id and p.direction = 'inbound'), 0),
    coalesce((select sum(p.amount) from public.payments p
              where p.invoice_id = i.id and p.direction = 'payout' and p.note = 'refund'), 0),
    coalesce((select sum(p.amount) from public.payments p
              where p.invoice_id = i.id and p.direction = 'inbound'), 0)
      - coalesce((select sum(p.amount) from public.payments p
              where p.invoice_id = i.id and p.direction = 'payout' and p.note = 'refund'), 0)
  from public.invoices i
  join public.assessment_sessions s on s.id = i.session_id
  left join public.profiles pr on pr.id = i.bill_to_profile_id
  where (public.has_role('finance_officer') or public.has_role('system_admin')
         or public.has_role('chairperson'))
    and s.status = 'cancelled'
    and i.status = 'paid'
    and coalesce((select sum(p.amount) from public.payments p
                  where p.invoice_id = i.id and p.direction = 'inbound'), 0)
        > coalesce((select sum(p.amount) from public.payments p
                  where p.invoice_id = i.id and p.direction = 'payout' and p.note = 'refund'), 0)
  order by s.scheduled_on nulls last;
$fn$;

grant execute on function public.list_refunds_due() to authenticated;

-- ---------------------------------------------------------------------------------
-- 3. mark_refund_paid — FO records that the refund was paid out (off-system transfer).
--    Inserts a 'payout' payment tagged note='refund' to the instructor.
-- ---------------------------------------------------------------------------------
create or replace function public.mark_refund_paid(
  _invoice_id uuid, _amount numeric, _method text default null, _reference text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_session uuid;
  v_bill_to uuid;
  v_status  text;
  v_refunded numeric;
  v_paid     numeric;
begin
  if not (public.has_role('finance_officer') or public.has_role('system_admin')
       or public.has_role('chairperson')) then
    raise exception 'not authorized to record refunds' using errcode = 'insufficient_privilege';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'amount must be positive' using errcode = 'check_violation';
  end if;

  select session_id, bill_to_profile_id, status
    into v_session, v_bill_to, v_status
    from public.invoices where id = _invoice_id;

  if v_session is null then
    raise exception 'invoice not found';
  end if;
  if v_status <> 'paid' then
    raise exception 'refund only applies to a paid invoice' using errcode = 'check_violation';
  end if;

  insert into public.payments
    (direction, invoice_id, session_id, payee_profile_id, amount, method, reference,
     recorded_by_profile_id, note)
  values
    ('payout', _invoice_id, v_session, v_bill_to, _amount, _method, _reference, (select auth.uid()), 'refund');

  select coalesce(sum(amount),0) into v_paid
    from public.payments where invoice_id = _invoice_id and direction = 'inbound';
  select coalesce(sum(amount),0) into v_refunded
    from public.payments where invoice_id = _invoice_id and direction = 'payout' and note = 'refund';

  return jsonb_build_object(
    'invoice_id', _invoice_id,
    'paid_amount', v_paid,
    'refunded', v_refunded,
    'fully_refunded', (v_refunded >= v_paid));
end;
$fn$;

grant execute on function public.mark_refund_paid(uuid, numeric, text, text) to authenticated;
