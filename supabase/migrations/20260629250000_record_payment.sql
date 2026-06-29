-- 20260629250000_record_payment.sql
-- #12 Assessment Workflow Redesign — payment recording.
-- Staff record an inbound payment against an invoice; status flips to 'paid' by CUMULATIVE sum
-- (handles deposits/instalments). Partial payment leaves it unpaid, keeping the cert gate shut.

create or replace function public.record_payment(
  _invoice_id uuid,
  _amount     numeric,
  _method     text default null,
  _reference  text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_session    uuid;
  v_bill_to    uuid;
  v_total      numeric;
  v_status     text;
  v_paid_sum   numeric;
  v_new_status text;
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')
       or public.has_role('chief_examiner') or public.has_role('system_admin')) then
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

  -- settle by cumulative sum, not single payment (handles deposits/instalments)
  select coalesce(sum(amount), 0)
    into v_paid_sum
    from public.payments
   where invoice_id = _invoice_id and direction = 'inbound';

  if v_paid_sum >= v_total then
    v_new_status := 'paid';
    update public.invoices
       set status = 'paid', paid_at = now()
     where id = _invoice_id;
  else
    v_new_status := 'issued';
    update public.invoices
       set status = 'issued'
     where id = _invoice_id and status = 'pro_forma';
  end if;

  return jsonb_build_object(
    'invoice_id', _invoice_id,
    'paid_to_date', v_paid_sum,
    'invoice_total', v_total,
    'status', v_new_status,
    'fully_paid', (v_paid_sum >= v_total));
end;
$function$;

grant execute on function public.record_payment(uuid, numeric, text, text) to authenticated;
