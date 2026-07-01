-- #17 unit 2 — instructor+centre lock on registration, and role-scoped registry.

-- (1) register_candidate — the registering person is auto-tagged, and the centre is
--     derived from THEIR OWN membership (their centre-affiliated membership, if any;
--     else independent). Consent is required. Replaces the client-side direct insert.
create or replace function public.register_candidate(_full_name text, _dob date, _consent boolean)
 returns table(
   id uuid, full_name text, date_of_birth date, partner_center_id uuid,
   status text, created_at timestamptz, claim_code text, swimmer_id text
 )
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_centre uuid;
  v_id     uuid;
begin
  if not (public.has_role('instructor') or public.has_role('master_trainer')
       or public.has_role('partner_center_admin') or public.has_role('chairperson')
       or public.has_role('board_member') or public.has_role('chief_examiner')
       or public.has_role('system_admin')) then
    raise exception 'not authorized to register candidates' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(_full_name, ''))) < 2 then
    raise exception 'a full name is required' using errcode = 'check_violation';
  end if;
  if _consent is not true then
    raise exception 'parental consent is required' using errcode = 'check_violation';
  end if;

  -- the registrant's centre: prefer a centre-affiliated active membership; else independent.
  select m.partner_center_id into v_centre
  from public.memberships m
  where m.profile_id = v_uid and m.partner_center_id is not null and m.status = 'active'
  order by m.granted_at desc nulls last
  limit 1;

  insert into public.candidates
    (full_name, date_of_birth, partner_center_id, registered_by_profile_id,
     parental_consent, consent_recorded_at, consent_recorded_by)
  values
    (trim(_full_name), _dob, v_centre, v_uid, true, now(), v_uid)
  returning candidates.id into v_id;

  return query
    select c.id, c.full_name, c.date_of_birth, c.partner_center_id,
           c.status::text, c.created_at, c.claim_code, c.swimmer_id
    from public.candidates c where c.id = v_id;
end;
$fn$;

grant execute on function public.register_candidate(text, date, boolean) to authenticated;

-- (2) role-scoped registry:
--     governance (chair/sysadmin/FO) -> all swimmers;
--     partner_center_admin -> swimmers at a centre they administer;
--     instructor (and anyone) -> swimmers they registered OR enrolled (instructor_of_record).
create or replace function public.list_swimmer_registry()
 returns table(
   candidate_id       uuid,
   full_name          text,
   date_of_birth      date,
   status             text,
   swimmer_id         text,
   claim_code         text,
   claim_status       text,
   instructor_name    text,
   centre_name        text,
   parent_name        text,
   parent_phone       text,
   highest_level      public.badge_level,
   highest_level_on   date,
   last_assessment    date,
   has_active_session boolean,
   cert_count         integer
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select
    c.id, c.full_name, c.date_of_birth, c.status::text,
    c.swimmer_id, c.claim_code,
    case when c.claimed_by_profile_id is not null then 'claimed' else 'unclaimed' end,
    ins.full_name,
    pc.name,
    par.full_name, par.phone,
    hi.level, hi.issued_on,
    la.last_on,
    coalesce(act.active, false),
    coalesce(cc.n, 0)::int
  from public.candidates c
  left join public.profiles ins on ins.id = c.registered_by_profile_id
  left join public.partner_centers pc on pc.id = c.partner_center_id
  left join public.profiles par on par.id = c.claimed_by_profile_id
  left join lateral (
    select ce.level, ce.issued_on
    from public.certificates ce
    where ce.candidate_id = c.id
    order by array_position(enum_range(null::public.badge_level), ce.level) desc, ce.issued_on desc
    limit 1
  ) hi on true
  left join lateral (
    select max(s.scheduled_on) as last_on
    from public.session_enrolments se
    join public.assessment_sessions s on s.id = se.session_id
    where se.candidate_id = c.id
  ) la on true
  left join lateral (
    select true as active
    from public.session_enrolments se
    join public.assessment_sessions s on s.id = se.session_id
    where se.candidate_id = c.id
      and s.status not in ('completed','closed','cancelled','archived')
    limit 1
  ) act on true
  left join lateral (
    select count(*) as n from public.certificates ce where ce.candidate_id = c.id
  ) cc on true
  where
    public.has_role('chairperson') or public.has_role('system_admin') or public.has_role('finance_officer')
    or (c.partner_center_id is not null and public.has_role('partner_center_admin', c.partner_center_id))
    or c.registered_by_profile_id = (select auth.uid())
    or exists (
      select 1 from public.session_enrolments se
      where se.candidate_id = c.id and se.instructor_of_record_profile_id = (select auth.uid())
    )
  order by c.full_name;
$fn$;

grant execute on function public.list_swimmer_registry() to authenticated;
