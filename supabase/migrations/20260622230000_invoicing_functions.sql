-- 20260622230000_invoicing_functions.sql
--
-- The invoicing engine. All functions are system_admin-gated SECURITY DEFINER
-- (the billing surface is staff-only). They run as the table owner, so they
-- operate past RLS while auth.uid() still identifies the acting staff member.
--
-- Prereq: migrations 18-22 committed.

----------------------------------------------------------------------
-- build_session_invoice(session): (re)generate the assessment-fee lines from
-- the roster and refresh totals. Pre-grading it bills every planned level
-- (pro-forma); once any outcome is recorded it bills only the levels actually
-- assessed (D1/D2). Manually-added lines (venue/adjustment/material) are kept.
----------------------------------------------------------------------
create or replace function public.build_session_invoice(_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invoice_id uuid;
  v_status     text;
  v_graded     boolean;
  v_subtotal   numeric(10,2);
  v_total      numeric(10,2);
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select id, status into v_invoice_id, v_status
    from public.invoices where session_id = _session_id;

  if v_invoice_id is not null and v_status in ('paid','void') then
    raise exception 'invoice for session % is % and cannot be rebuilt', _session_id, v_status;
  end if;

  -- ensure an invoice exists, bill-to = booking instructor
  insert into public.invoices (session_id, bill_to_profile_id, partner_center_id)
  select s.id, s.requested_by_profile_id, s.partner_center_id
    from public.assessment_sessions s
   where s.id = _session_id
  on conflict (session_id) do update
    set bill_to_profile_id = excluded.bill_to_profile_id,
        partner_center_id  = excluded.partner_center_id
  returning id into v_invoice_id;

  v_graded := exists (
    select 1 from public.assessment_results
    where session_id = _session_id and outcome is not null
  );

  -- regenerate only the assessment-fee lines
  delete from public.invoice_items
   where invoice_id = v_invoice_id and item_type = 'assessment_fee';

  insert into public.invoice_items
    (invoice_id, item_type, description, level, candidate_id, quantity, unit_amount, amount)
  select v_invoice_id, 'assessment_fee',
         'Assessment — ' || initcap(replace(r.target_level::text, '_', ' ')) || ' — ' || c.full_name,
         r.target_level, r.candidate_id, 1, f.amount, f.amount
    from public.assessment_results r
    join public.candidates       c on c.id = r.candidate_id
    join public.assessment_fees  f on f.level = r.target_level
   where r.session_id = _session_id
     and (case when v_graded then r.outcome is not null else true end);

  select coalesce(sum(amount) filter (where item_type = 'assessment_fee'), 0),
         coalesce(sum(amount), 0)
    into v_subtotal, v_total
    from public.invoice_items where invoice_id = v_invoice_id;

  update public.invoices
     set subtotal = v_subtotal, total = v_total
   where id = v_invoice_id;

  return v_invoice_id;
end;
$function$;

----------------------------------------------------------------------
-- record_invoice_payment(invoice, amount, method, reference): log the inbound
-- payment, mark the invoice paid, stamp a receipt number.
----------------------------------------------------------------------
create or replace function public.record_invoice_payment(
  _invoice_id uuid, _amount numeric, _method text default null, _reference text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.invoices where id = _invoice_id;
  if v_status is null then
    raise exception 'invoice % not found', _invoice_id;
  end if;
  if v_status not in ('pro_forma','issued') then
    raise exception 'invoice % is % and cannot be paid', _invoice_id, v_status;
  end if;

  insert into public.payments
    (direction, invoice_id, amount, method, reference, recorded_by_profile_id)
  values
    ('inbound', _invoice_id, _amount, _method, _reference, (select auth.uid()));

  update public.invoices
     set status     = 'paid',
         paid_at    = now(),
         receipt_no = 'MAS-RCT-' || to_char(now(),'YYYYMMDD') || '-' ||
                      upper(substr(replace(_invoice_id::text,'-',''),1,6))
   where id = _invoice_id;
end;
$function$;

----------------------------------------------------------------------
-- issue_certificates_for_session(session): the bulk "verify all" action.
-- Gated on the invoice being PAID. Inserts one certificate per passing,
-- uncertified result; link_certificate_to_result links each pass. Returns count.
----------------------------------------------------------------------
create or replace function public.issue_certificates_for_session(_session_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_count  integer;
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.invoices where session_id = _session_id;
  if v_status is distinct from 'paid' then
    raise exception 'cannot issue certificates: session % invoice is not paid', _session_id;
  end if;

  insert into public.certificates
    (candidate_id, candidate_name_snapshot, level, issued_by_profile_id, partner_center_id, issued_on)
  select r.candidate_id, c.full_name, r.target_level, (select auth.uid()),
         s.partner_center_id, current_date
    from public.assessment_results   r
    join public.candidates           c on c.id = r.candidate_id
    join public.assessment_sessions  s on s.id = r.session_id
   where r.session_id     = _session_id
     and r.outcome        = 'pass'
     and r.certificate_id is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

----------------------------------------------------------------------
-- expected_examiner_payout(session): per-candidate base + travel default,
-- from app_settings. Read helper for the staff view.
----------------------------------------------------------------------
create or replace function public.expected_examiner_payout(_session_id uuid)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_base   numeric(10,2);
  v_travel numeric(10,2);
  v_heads  integer;
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(value,0) into v_base   from public.app_settings where key = 'examiner_base_per_candidate';
  select coalesce(value,0) into v_travel from public.app_settings where key = 'examiner_travel_default';
  select count(distinct candidate_id) into v_heads
    from public.assessment_results where session_id = _session_id;

  return coalesce(v_base,0) * coalesce(v_heads,0) + coalesce(v_travel,0);
end;
$function$;

----------------------------------------------------------------------
-- record_examiner_payout(session, amount, reference): the outbound payout leg.
----------------------------------------------------------------------
create or replace function public.record_examiner_payout(
  _session_id uuid, _amount numeric, _reference text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_examiner uuid;
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select examiner_profile_id into v_examiner
    from public.assessment_sessions where id = _session_id;
  if v_examiner is null then
    raise exception 'session % has no assigned examiner', _session_id;
  end if;

  insert into public.payments
    (direction, session_id, payee_profile_id, amount, reference, recorded_by_profile_id)
  values
    ('payout', _session_id, v_examiner, _amount, _reference, (select auth.uid()));
end;
$function$;

----------------------------------------------------------------------
-- close_session(session): allowed only when BOTH legs are settled —
-- invoice paid AND an examiner payout recorded.
----------------------------------------------------------------------
create or replace function public.close_session(_session_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_paid   boolean;
  v_payout boolean;
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  v_paid := exists (
    select 1 from public.invoices where session_id = _session_id and status = 'paid'
  );
  v_payout := exists (
    select 1 from public.payments where session_id = _session_id and direction = 'payout'
  );

  if not v_paid then
    raise exception 'cannot close: invoice for session % is not paid', _session_id;
  end if;
  if not v_payout then
    raise exception 'cannot close: no examiner payout recorded for session %', _session_id;
  end if;

  update public.assessment_sessions set status = 'closed' where id = _session_id;
end;
$function$;

----------------------------------------------------------------------
-- archive_session(session): tidy a closed session out of the active list.
----------------------------------------------------------------------
create or replace function public.archive_session(_session_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status public.session_status;
begin
  if not public.has_role('system_admin') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.assessment_sessions where id = _session_id;
  if v_status is distinct from 'closed' then
    raise exception 'only closed sessions can be archived (session % is %)', _session_id, v_status;
  end if;

  update public.assessment_sessions set status = 'archived' where id = _session_id;
end;
$function$;
