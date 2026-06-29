-- 20260629210000_submit_session_results.sql
-- #12 Assessment Workflow Redesign — grading/issuance layer, piece 3 of 4.
-- Examiner "submit results" entry point: marks session completed and auto-generates the
-- stage-2 (bonus_reconcile) invoice from bonus passes. Examiner never sees the amount.

create or replace function public.submit_session_results(_session_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_examiner       uuid;
  v_bill_to        uuid;
  v_partner_center uuid;
  v_subtotal       numeric;
  v_invoice_id     uuid;
begin
  -- authorize: caller is the session's assigned examiner
  select examiner_profile_id, requested_by_profile_id, partner_center_id
    into v_examiner, v_bill_to, v_partner_center
    from public.assessment_sessions
   where id = _session_id;

  if v_examiner is null or v_examiner <> (select auth.uid()) then
    raise exception 'not authorized: caller is not the assigned examiner for session %', _session_id
      using errcode = 'insufficient_privilege';
  end if;

  -- mark completed (only from scheduled; won't revert a closed/archived session)
  update public.assessment_sessions
     set status = 'completed'
   where id = _session_id and status = 'scheduled';

  -- STAGE 2: bonus-reconcile invoice from bonus passes (guarded; skips if one already live)
  if not exists (
    select 1 from public.invoices
    where session_id = _session_id and stage = 'bonus_reconcile' and status <> 'void'
  ) then
    select coalesce(sum(coalesce(r.fee_rm_snapshot, f.fee_rm)), 0)
      into v_subtotal
      from public.assessment_results r
      left join public.fee_schedule f on f.level = r.target_level
     where r.session_id = _session_id
       and r.billing_stage = 'bonus'
       and r.outcome = 'pass';

    if v_bill_to is not null and v_subtotal > 0 then
      insert into public.invoices
        (session_id, stage, bill_to_profile_id, partner_center_id, status, subtotal, total)
      values
        (_session_id, 'bonus_reconcile', v_bill_to, v_partner_center, 'pro_forma', v_subtotal, v_subtotal)
      returning id into v_invoice_id;

      insert into public.invoice_items
        (invoice_id, item_type, description, level, candidate_id, quantity, unit_amount, amount)
      select
        v_invoice_id,
        'assessment_fee',
        'Bonus level pass — ' || r.target_level::text,
        r.target_level,
        r.candidate_id,
        1,
        coalesce(r.fee_rm_snapshot, f.fee_rm),
        coalesce(r.fee_rm_snapshot, f.fee_rm)
      from public.assessment_results r
      left join public.fee_schedule f on f.level = r.target_level
      where r.session_id = _session_id
        and r.billing_stage = 'bonus'
        and r.outcome = 'pass';
    end if;
  end if;

  return v_invoice_id;
end;
$function$;

grant execute on function public.submit_session_results(uuid) to authenticated;
