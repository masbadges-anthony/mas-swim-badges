-- #16 reference — controlled withdraw/restore for candidates.
-- Uses the existing candidate_status enum (active | withdrawn | anonymized).
-- 'withdrawn' is the archive concept; 'anonymized' is retention-managed elsewhere
-- (anonymize_candidate) and cannot be toggled here.
create or replace function public.set_candidate_status(_candidate_id uuid, _status text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_owner   uuid;
  v_current public.candidate_status;
begin
  if _status not in ('active', 'withdrawn') then
    raise exception 'status must be active or withdrawn' using errcode = 'check_violation';
  end if;

  select registered_by_profile_id, status into v_owner, v_current
    from public.candidates where id = _candidate_id;
  if v_owner is null then
    raise exception 'candidate not found';
  end if;

  if not (v_owner = (select auth.uid())
          or public.has_role('chairperson') or public.has_role('board_member')
          or public.has_role('chief_examiner') or public.has_role('system_admin')) then
    raise exception 'not authorized to change this candidate' using errcode = 'insufficient_privilege';
  end if;

  if v_current = 'anonymized' then
    raise exception 'an anonymized candidate cannot be changed' using errcode = 'check_violation';
  end if;

  update public.candidates set status = _status::public.candidate_status where id = _candidate_id;
end;
$fn$;

grant execute on function public.set_candidate_status(uuid, text) to authenticated;
