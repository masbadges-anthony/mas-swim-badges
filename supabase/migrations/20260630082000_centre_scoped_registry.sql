-- #17 unit 3 — centre-collective scoping for the swimmer registry.
-- Governance: all swimmers.
-- Centre admin: swimmers at any centre they administer (unchanged).
-- Instructor / anyone with a centre: swimmers at the SAME centre as any of the
--   caller's active centre-affiliated memberships (collective centre view).
-- Instructor / anyone WITHOUT a centre: swimmers they registered OR enrolled
--   (fallback to personal scope).
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
  with me as (
    select (select auth.uid()) as uid
  ),
  my_centres as (
    -- centres the caller is affiliated with via any active membership
    select m.partner_center_id
    from public.memberships m, me
    where m.profile_id = me.uid and m.status = 'active' and m.partner_center_id is not null
  )
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
  cross join me
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
    -- governance: everyone
    public.has_role('chairperson') or public.has_role('system_admin') or public.has_role('finance_officer')
    -- centre admin: any candidate at a centre they administer
    or (c.partner_center_id is not null and public.has_role('partner_center_admin', c.partner_center_id))
    -- caller has a centre: collective centre view (any candidate at one of THEIR centres)
    or (exists (select 1 from my_centres)
        and c.partner_center_id in (select partner_center_id from my_centres))
    -- caller has NO centre: fall back to personal scope (own registrations + own enrolments)
    or (not exists (select 1 from my_centres)
        and (c.registered_by_profile_id = me.uid
             or exists (select 1 from public.session_enrolments se
                        where se.candidate_id = c.id
                          and se.instructor_of_record_profile_id = me.uid)))
  order by c.full_name;
$fn$;

grant execute on function public.list_swimmer_registry() to authenticated;

-- list_swimmer_certificates: match the same scope so certs are readable wherever
-- the registry row itself is.
create or replace function public.list_swimmer_certificates(_candidate_id uuid)
 returns table(serial text, level public.badge_level, issued_on date, centre_name text)
 language sql
 stable security definer
 set search_path to ''
as $fn$
  with me as (select (select auth.uid()) as uid),
  my_centres as (
    select m.partner_center_id
    from public.memberships m, me
    where m.profile_id = me.uid and m.status = 'active' and m.partner_center_id is not null
  ),
  cand as (
    select id, partner_center_id, registered_by_profile_id
    from public.candidates where id = _candidate_id
  )
  select ce.serial, ce.level, ce.issued_on, pc.name
  from public.certificates ce
  left join public.partner_centers pc on pc.id = ce.partner_center_id
  cross join me
  where ce.candidate_id = _candidate_id
    and (
      public.has_role('chairperson') or public.has_role('system_admin') or public.has_role('finance_officer')
      or exists (select 1 from cand where cand.partner_center_id is not null
                  and public.has_role('partner_center_admin', cand.partner_center_id))
      or (exists (select 1 from my_centres)
          and exists (select 1 from cand where cand.partner_center_id in (select partner_center_id from my_centres)))
      or (not exists (select 1 from my_centres)
          and (exists (select 1 from cand where cand.registered_by_profile_id = me.uid)
               or exists (select 1 from public.session_enrolments se
                          where se.candidate_id = _candidate_id
                            and se.instructor_of_record_profile_id = me.uid)))
    )
  order by array_position(enum_range(null::public.badge_level), ce.level);
$fn$;

grant execute on function public.list_swimmer_certificates(uuid) to authenticated;
