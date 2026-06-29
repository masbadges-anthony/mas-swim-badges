-- 20260629260000_tidyups_guard_and_payments_read.sql
-- #12 tidy-ups: (1) result-row fee-tamper guard, (2) instructor payment visibility.

-- (1) Result-row tamper guard: app users may set only outcome/notes/assessed_on.
create or replace function public.guard_result_immutable_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then
    return new;  -- service role / SQL editor / definer maintenance: not an end user
  end if;

  if (public.has_role('chairperson') or public.has_role('board_member')
      or public.has_role('chief_examiner') or public.has_role('system_admin')) then
    return new;  -- governance/admin may correct anything
  end if;

  if new.fee_rm_snapshot is distinct from old.fee_rm_snapshot
     or new.billing_stage is distinct from old.billing_stage
     or new.target_level  is distinct from old.target_level
     or new.candidate_id  is distinct from old.candidate_id
     or new.enrolment_id  is distinct from old.enrolment_id
     or new.session_id    is distinct from old.session_id then
    raise exception 'only outcome, notes, and assessed_on may be changed on an assessment result'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_result_columns on public.assessment_results;
create trigger trg_guard_result_columns
  before update on public.assessment_results
  for each row execute function public.guard_result_immutable_columns();

-- (2) Let the billed instructor see their own payment records (firewall still excludes examiners).
drop policy if exists payments_select_bill_to on public.payments;
create policy payments_select_bill_to on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and i.bill_to_profile_id = (select auth.uid())
    )
  );
