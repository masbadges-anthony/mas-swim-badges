-- #14 unit 2 — FO bonus billing: preview the draft, then "Create invoice".
-- submit_session_results creates the bonus invoice as a pro_forma DRAFT with NO number
-- (receipt_no null). The Finance Officer reviews it (list_bonus_drafts) and issues it
-- (issue_bonus_invoice), which allocates the gapless number and flips it to 'issued' —
-- only then is it visible to the instructor (list_my_invoices hides unissued bonus drafts).

-- ---------------------------------------------------------------------------------
-- (1) list_bonus_drafts — pending bonus drafts with their line items, for the FO preview.
-- ---------------------------------------------------------------------------------
create or replace function public.list_bonus_drafts()
 returns table(
   invoice_id   uuid,
   session_id   uuid,
   venue        text,
   scheduled_on date,
   bill_to_name text,
   total        numeric,
   created_at   timestamptz,
   items        jsonb
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select
    i.id, i.session_id, s.venue, s.scheduled_on, pr.full_name, i.total, i.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'description', ii.description,
               'level', ii.level,
               'candidate_name', c.full_name,
               'amount', ii.amount)
             order by ii.created_at)
      from public.invoice_items ii
      left join public.candidates c on c.id = ii.candidate_id
      where ii.invoice_id = i.id
    ), '[]'::jsonb)
  from public.invoices i
  join public.assessment_sessions s on s.id = i.session_id
  left join public.profiles pr on pr.id = i.bill_to_profile_id
  where (public.has_role('finance_officer') or public.has_role('system_admin')
         or public.has_role('chairperson'))
    and i.stage = 'bonus_reconcile'
    and i.status = 'pro_forma'
    and i.receipt_no is null
  order by i.created_at;
$fn$;

grant execute on function public.list_bonus_drafts() to authenticated;

-- ---------------------------------------------------------------------------------
-- (2) issue_bonus_invoice — the FO "Create invoice" action.
--     Allocates the gapless number, flips pro_forma -> issued, stamps issued_at.
--     Now the instructor can see + pay it.
-- ---------------------------------------------------------------------------------
create or replace function public.issue_bonus_invoice(_invoice_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_stage  text;
  v_status text;
  v_no     text;
begin
  if not (public.has_role('finance_officer') or public.has_role('system_admin')
       or public.has_role('chairperson')) then
    raise exception 'not authorized to issue invoices' using errcode = 'insufficient_privilege';
  end if;

  select stage, status into v_stage, v_status
    from public.invoices where id = _invoice_id for update;

  if v_stage is null then
    raise exception 'invoice not found';
  end if;
  if v_stage <> 'bonus_reconcile' then
    raise exception 'only bonus drafts are issued here' using errcode = 'check_violation';
  end if;
  if v_status <> 'pro_forma' then
    raise exception 'invoice is not a pending draft (status %)', v_status using errcode = 'check_violation';
  end if;

  v_no := public.next_invoice_no();

  update public.invoices
     set receipt_no = v_no,
         status     = 'issued',
         issued_at  = now()
   where id = _invoice_id;

  return jsonb_build_object('invoice_id', _invoice_id, 'invoice_no', v_no, 'status', 'issued');
end;
$fn$;

grant execute on function public.issue_bonus_invoice(uuid) to authenticated;
