-- 20260629220000_issue_session_certificates.sql
-- #12 Assessment Workflow Redesign — grading/issuance layer, piece 4 of 4.
-- Payment-gated, two-batch certificate issuer (decision A: gate on invoices.status='paid').
-- Mints one cert per passing, not-yet-certified result of the stage; the certificates_require_pass
-- trigger back-links each cert to its result. Idempotent via the certificate_id is null filter.

create or replace function public.issue_session_certificates(_session_id uuid, _stage public.result_billing_stage)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_invoice_stage text;
  v_count         integer;
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')
       or public.has_role('chief_examiner') or public.has_role('system_admin')) then
    raise exception 'not authorized to issue certificates' using errcode = 'insufficient_privilege';
  end if;

  v_invoice_stage := case _stage
                       when 'booked' then 'booked_prepay'
                       when 'bonus'  then 'bonus_reconcile'
                     end;

  -- payment gate (decision A): that stage's invoice must be paid
  if not exists (
    select 1 from public.invoices
    where session_id = _session_id
      and stage = v_invoice_stage
      and status = 'paid'
  ) then
    raise exception 'cannot issue %: stage invoice not paid for session %', _stage, _session_id
      using errcode = 'check_violation';
  end if;

  -- mint a certificate per passing, not-yet-certified result of this stage;
  -- the certificates_require_pass trigger back-links each cert to its result.
  insert into public.certificates
    (candidate_id, candidate_name_snapshot, level, issued_by_profile_id, partner_center_id)
  select
    r.candidate_id,
    e.candidate_name_snapshot,
    r.target_level,
    (select auth.uid()),
    e.partner_center_id_snapshot
  from public.assessment_results r
  join public.session_enrolments e on e.id = r.enrolment_id
  where r.session_id    = _session_id
    and r.billing_stage = _stage
    and r.outcome       = 'pass'
    and r.certificate_id is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

grant execute on function public.issue_session_certificates(uuid, public.result_billing_stage) to authenticated;
