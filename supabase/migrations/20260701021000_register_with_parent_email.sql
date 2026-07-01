-- #19 unit 1b — extend register_candidate to accept optional parent_email.
-- Additive change: existing call sites (none in the repo apart from RegisterCandidate)
-- keep working since the new param is defaulted. Also returns parent_email in the
-- output so the UI can echo it back.

create or replace function public.register_candidate(
  _full_name    text,
  _dob          date,
  _consent      boolean,
  _parent_email text default null
)
 returns table(
   id                  uuid,
   full_name           text,
   date_of_birth       date,
   partner_center_id   uuid,
   status              text,
   created_at          timestamptz,
   claim_code          text,
   swimmer_id          text,
   parent_email        text
 )
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  _me uuid := (select auth.uid());
  _centre uuid;
  _new_id uuid;
begin
  if _me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Only instructors may register candidates.
  if not public.has_role('instructor') then
    raise exception 'only instructors may register candidates' using errcode = 'insufficient_privilege';
  end if;

  -- Derive centre from the caller's own instructor membership. Prefer
  -- centre-affiliated over independent (null centre) if both exist.
  select m.partner_center_id into _centre
  from public.memberships m
  where m.profile_id = _me
    and m.role = 'instructor'
    and m.status = 'active'
    and (m.expires_at is null or m.expires_at > now())
  order by (m.partner_center_id is not null) desc
  limit 1;

  insert into public.candidates (
    full_name, date_of_birth, partner_center_id, registered_by_profile_id,
    parental_consent, consent_recorded_at, consent_recorded_by, parent_email
  ) values (
    _full_name, _dob, _centre, _me,
    _consent, case when _consent then now() else null end, case when _consent then _me else null end,
    nullif(trim(_parent_email), '')
  )
  returning candidates.id into _new_id;

  return query
  select c.id, c.full_name, c.date_of_birth, c.partner_center_id,
         c.status::text, c.created_at, c.claim_code, c.swimmer_id, c.parent_email
  from public.candidates c where c.id = _new_id;
end;
$fn$;

grant execute on function public.register_candidate(text, date, boolean, text) to authenticated;
