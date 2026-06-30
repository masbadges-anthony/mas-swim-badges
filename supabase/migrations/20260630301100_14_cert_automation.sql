-- #14 unit 1 — automatic certificate release (booked-on-submit, bonus-on-payment).

-- #14 unit 1 — automatic certificate release.
-- Booked certs auto-issue on examiner submit (booked invoice is prepaid).
-- Bonus certs auto-issue when the bonus invoice is recorded paid.
-- Internal helper has NO role gate (called only by trusted definer functions) and
-- SKIPS silently if the stage invoice isn't paid (never raises — can't break a submit).

-- ---------------------------------------------------------------------------------
-- (0) internal issuance helper — mirrors issue_session_certificates' minting, minus
--     the role gate, and never raises.
-- ---------------------------------------------------------------------------------
create or replace function public._auto_issue_certs(_session_id uuid, _stage public.result_billing_stage)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_invoice_stage text;
  v_count integer := 0;
begin
  v_invoice_stage := case _stage when 'booked' then 'booked_prepay'
                                 when 'bonus'  then 'bonus_reconcile' end;

  -- only issue if that stage's invoice is paid; otherwise skip silently
  if not exists (
    select 1 from public.invoices
    where session_id = _session_id and stage = v_invoice_stage and status = 'paid'
  ) then
    return 0;
  end if;

  insert into public.certificates
    (candidate_id, candidate_name_snapshot, level, issued_by_profile_id, partner_center_id)
  select r.candidate_id, e.candidate_name_snapshot, r.target_level,
         (select auth.uid()), e.partner_center_id_snapshot
  from public.assessment_results r
  join public.session_enrolments e on e.id = r.enrolment_id
  where r.session_id    = _session_id
    and r.billing_stage = _stage
    and r.outcome       = 'pass'
    and r.certificate_id is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke execute on function public._auto_issue_certs(uuid, public.result_billing_stage) from public;

-- ---------------------------------------------------------------------------------
-- (1) submit_session_results — now AUTO-ISSUES booked certs after completing.
--     (carries forward the 'claimed' fix + the bonus-draft creation, unchanged)
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

  -- AUTO-ISSUE booked certs (booked invoice is prepaid; helper skips if somehow unpaid)
  perform public._auto_issue_certs(_session_id, 'booked');

  -- STAGE 2: bonus-reconcile invoice from bonus passes (pro_forma DRAFT, no number yet —
  -- the Finance Officer issues+numbers it later via #14 unit 2). Guarded against duplicates.
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

  return v_invoice_id;
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (2) record_payment — now AUTO-ISSUES bonus certs when the bonus invoice clears.
--     (carries forward the booked-prepay pickup gate, unchanged)
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

    -- GATE: booked-prepay clearing opens the session to the examiner pool.
    if v_stage = 'booked_prepay' then
      update public.assessment_sessions
         set status = 'open_for_pickup'
       where id = v_session and status = 'awaiting_payment';
    end if;

    -- AUTO-ISSUE bonus certs when the bonus invoice clears.
    if v_stage = 'bonus_reconcile' then
      perform public._auto_issue_certs(v_session, 'bonus');
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

-- registry reads for the read-only certificate screen.

-- #14 unit 1 (read side) — issued-certificate registry for the (now read-only) screen.
-- Joins certificates -> assessment_results (back-link) -> sessions for context.
create or replace function public.list_issued_certificates(_limit int default 300)
 returns table(
   serial         text,
   candidate_name text,
   level          public.badge_level,
   billing_stage  public.result_billing_stage,
   issued_on      date,
   venue          text,
   scheduled_on   date
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select c.serial, c.candidate_name_snapshot, c.level, r.billing_stage,
         c.issued_on, s.venue, s.scheduled_on
  from public.certificates c
  left join public.assessment_results  r on r.certificate_id = c.id
  left join public.assessment_sessions s on s.id = r.session_id
  where public.has_role('chairperson') or public.has_role('board_member')
     or public.has_role('chief_examiner') or public.has_role('system_admin')
  order by c.created_at desc
  limit _limit;
$fn$;

grant execute on function public.list_issued_certificates(int) to authenticated;

-- A small count of passes still awaiting a certificate (will auto-issue when their
-- stage invoice clears) — informational, for the registry header.
create or replace function public.count_certs_awaiting()
 returns integer
 language sql stable security definer set search_path to ''
as $fn$
  select case when public.has_role('chairperson') or public.has_role('board_member')
                or public.has_role('chief_examiner') or public.has_role('system_admin')
              then (select count(*)::int from public.assessment_results
                    where outcome = 'pass' and certificate_id is null)
              else 0 end;
$fn$;

grant execute on function public.count_certs_awaiting() to authenticated;
