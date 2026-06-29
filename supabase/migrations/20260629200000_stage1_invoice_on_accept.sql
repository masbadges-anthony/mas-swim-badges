-- 20260629200000_stage1_invoice_on_accept.sql
-- #12 Assessment Workflow Redesign — grading/issuance layer, piece 2 of 4.
--
-- Appends stage-1 (booked_prepay) invoice generation to the ACCEPT branch of respond_to_invitation,
-- so the booked invoice is created in the SAME transaction the session becomes 'scheduled'. If the
-- per-row COI trigger rolls back the accept, the invoice rolls back too.
--
-- Bill-to = the session's single instructor-of-record (requested_by_profile_id).
-- Generation is GUARDED: skips if a live booked invoice already exists (re-accept safe), if there is
-- no requester to bill, or if the session has no enrolments. The original body is preserved verbatim;
-- only the generation block is added.

create or replace function public.respond_to_invitation(_invitation_id uuid, _accept boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_session_id     uuid;
  v_examiner       uuid;
  v_bill_to        uuid;
  v_partner_center uuid;
  v_subtotal       numeric;
  v_invoice_id     uuid;
begin
  select session_id, examiner_profile_id
    into v_session_id, v_examiner
    from public.session_invitations
   where id = _invitation_id;

  if v_session_id is null then
    raise exception 'invitation not found';
  end if;

  if v_examiner <> (select auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if not _accept then
    update public.session_invitations
       set status = 'declined', responded_at = now()
     where id = _invitation_id;
    return;
  end if;

  -- ACCEPT
  update public.session_invitations
     set status = 'accepted', responded_at = now()
   where id = _invitation_id;

  update public.assessment_sessions
     set examiner_profile_id = v_examiner,
         status = 'scheduled'
   where id = v_session_id;

  -- assign across the roster; enforce_assessment_coi fires per row and rolls
  -- back the whole accept if any rostered candidate is a conflict
  update public.assessment_results
     set assessor_profile_id = v_examiner
   where session_id = v_session_id;

  -- the slot is filled; withdraw any other still-open invitations
  update public.session_invitations
     set status = 'withdrawn', responded_at = now()
   where session_id = v_session_id
     and id <> _invitation_id
     and status = 'invited';

  -- ── STAGE 1: booked-prepay invoice (guarded; same transaction as the accept) ──
  if not exists (
    select 1 from public.invoices
    where session_id = v_session_id and stage = 'booked_prepay' and status <> 'void'
  ) then
    select requested_by_profile_id, partner_center_id
      into v_bill_to, v_partner_center
      from public.assessment_sessions
     where id = v_session_id;

    if v_bill_to is not null
       and exists (select 1 from public.session_enrolments where session_id = v_session_id) then

      select coalesce(sum(f.fee_rm), 0)
        into v_subtotal
        from public.session_enrolments e
        join public.fee_schedule f on f.level = e.booked_level
       where e.session_id = v_session_id;

      insert into public.invoices
        (session_id, stage, bill_to_profile_id, partner_center_id, status, subtotal, total)
      values
        (v_session_id, 'booked_prepay', v_bill_to, v_partner_center, 'pro_forma', v_subtotal, v_subtotal)
      returning id into v_invoice_id;

      insert into public.invoice_items
        (invoice_id, item_type, description, level, candidate_id, quantity, unit_amount, amount)
      select
        v_invoice_id,
        'assessment_fee',
        'Assessment fee — ' || e.booked_level::text,
        e.booked_level,
        e.candidate_id,
        1,
        f.fee_rm,
        f.fee_rm
      from public.session_enrolments e
      join public.fee_schedule f on f.level = e.booked_level
      where e.session_id = v_session_id;
    end if;
  end if;
end;
$function$;
