-- #17 unit 1 — swimmer registry reads. Gated to chairperson/system_admin/finance_officer.
-- No schema changes; all data derived from existing tables.

-- (1) full registry — one row per swimmer with derived aggregates.
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
  where public.has_role('chairperson') or public.has_role('system_admin') or public.has_role('finance_officer')
  order by c.full_name;
$fn$;

grant execute on function public.list_swimmer_registry() to authenticated;

-- (2) released certificates for one swimmer (for the registry expand + cert links).
create or replace function public.list_swimmer_certificates(_candidate_id uuid)
 returns table(serial text, level public.badge_level, issued_on date, centre_name text)
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select ce.serial, ce.level, ce.issued_on, pc.name
  from public.certificates ce
  left join public.partner_centers pc on pc.id = ce.partner_center_id
  where ce.candidate_id = _candidate_id
    and (public.has_role('chairperson') or public.has_role('system_admin') or public.has_role('finance_officer'))
  order by array_position(enum_range(null::public.badge_level), ce.level);
$fn$;

grant execute on function public.list_swimmer_certificates(uuid) to authenticated;
