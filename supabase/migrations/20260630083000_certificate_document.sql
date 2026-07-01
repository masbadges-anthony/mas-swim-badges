-- #17 unit 4 — certificate document read for the printable A4-landscape cert.
-- Scope: the claimed parent (own child), governance, centre admin (their centre),
-- and anyone at the same centre as the candidate (centre-collective) — mirroring
-- the swimmer-registry scope. Instructor who registered the child is covered by
-- the centre-collective branch when they share a centre, or by a personal branch
-- when they were the registrar. Also readable to the assigned examiner of the
-- session that produced the cert, so they can review what they issued.
create or replace function public.get_certificate_document(_serial text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $fn$
declare
  v jsonb;
  v_uid uuid := (select auth.uid());
  v_cand uuid;
  v_cand_centre uuid;
  v_cand_registered_by uuid;
  v_cand_claimed_by uuid;
  v_session_examiner uuid;
begin
  select ce.candidate_id,
         c.partner_center_id, c.registered_by_profile_id, c.claimed_by_profile_id,
         s.examiner_profile_id
    into v_cand, v_cand_centre, v_cand_registered_by, v_cand_claimed_by, v_session_examiner
    from public.certificates ce
    join public.candidates c on c.id = ce.candidate_id
    left join public.assessment_results r on r.certificate_id = ce.id
    left join public.assessment_sessions s on s.id = r.session_id
   where ce.serial = _serial
   limit 1;

  if v_cand is null then
    raise exception 'certificate not found';
  end if;

  if not (
       public.has_role('chairperson') or public.has_role('system_admin')
    or public.has_role('finance_officer')
    or (v_cand_centre is not null and public.has_role('partner_center_admin', v_cand_centre))
    or v_cand_claimed_by = v_uid
    or v_cand_registered_by = v_uid
    or v_session_examiner = v_uid
    or (v_cand_centre is not null and exists (
        select 1 from public.memberships m
        where m.profile_id = v_uid and m.status = 'active'
          and m.partner_center_id = v_cand_centre))
  ) then
    raise exception 'not authorized to view this certificate' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'serial', ce.serial,
    'level', ce.level,
    'issued_on', ce.issued_on,
    'candidate_name', coalesce(ce.candidate_name_snapshot, c.full_name),
    'centre_name', pc.name,
    'instructor_name', ins.full_name,
    'examiner_name', ex.full_name,
    'issued_by_name', iss.full_name
  ) into v
  from public.certificates ce
  join public.candidates c on c.id = ce.candidate_id
  left join public.partner_centers pc on pc.id = ce.partner_center_id
  left join public.profiles ins on ins.id = c.registered_by_profile_id
  left join public.assessment_results r on r.certificate_id = ce.id
  left join public.assessment_sessions s on s.id = r.session_id
  left join public.profiles ex on ex.id = s.examiner_profile_id
  left join public.profiles iss on iss.id = ce.issued_by_profile_id
  where ce.serial = _serial;

  return v;
end;
$fn$;

grant execute on function public.get_certificate_document(text) to authenticated;
