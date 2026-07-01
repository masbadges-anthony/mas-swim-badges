-- #18 unit 1 — atomic membership grant used by the admin-create-user Edge Function.
--
-- The Edge Function calls Supabase's inviteUserByEmail which is async — the auth
-- user row is created, our handle_new_user trigger fires, then the profile row
-- appears. The Edge Function needs to grant a membership immediately after invite
-- succeeds; this wrapper handles the race by spin-waiting briefly for the profile.
--
-- Gated to system_admin/chairperson (SECURITY DEFINER, but auth.uid() check inside).
-- Enforces the memberships CHECK explicitly with clearer errors than a raw
-- constraint violation would produce.

create or replace function public.admin_grant_membership(
  _profile_id  uuid,
  _role        public.membership_role,
  _state       public.my_state default null,
  _centre_id   uuid default null,
  _expires_at  date default null
)
 returns table(membership_id uuid, profile_id uuid, role text, state text, partner_center_id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  _me uuid := (select auth.uid());
  _new_id uuid;
  _tries int := 0;
  _profile_exists boolean := false;
begin
  -- Authorization
  if _me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not (public.has_role('system_admin') or public.has_role('chairperson')) then
    raise exception 'only system administrators and the chairperson may provision accounts'
      using errcode = 'insufficient_privilege';
  end if;

  -- Scope validation — mirror the memberships_scope_valid CHECK but with clear errors.
  if _role = 'examiner' then
    if _state is null then
      raise exception 'examiner role requires a state' using errcode = '23514';
    end if;
    if _centre_id is not null then
      raise exception 'examiner role must not have a centre' using errcode = '23514';
    end if;
  elsif _role = 'partner_center_admin' then
    if _centre_id is null then
      raise exception 'partner_center_admin role requires a centre' using errcode = '23514';
    end if;
  elsif _role in ('board_member', 'coaching_panel', 'chairperson', 'chief_examiner',
                  'examiner_trainer', 'master_trainer', 'finance_officer') then
    if _centre_id is not null then
      raise exception '% role must not have a centre', _role::text using errcode = '23514';
    end if;
  end if;
  -- system_admin, instructor, instructor_trainer: no scope constraint (fall through).

  -- Wait up to ~1s for handle_new_user to create the profile row (the invite is
  -- async; the auth user might be a moment ahead of the profile). ~10 tries × 100ms.
  loop
    select exists(select 1 from public.profiles where id = _profile_id)
      into _profile_exists;
    exit when _profile_exists or _tries >= 10;
    perform pg_sleep(0.1);
    _tries := _tries + 1;
  end loop;

  if not _profile_exists then
    raise exception 'profile for user % not created within 1s — invite may have failed', _profile_id
      using errcode = 'P0002';
  end if;

  -- Idempotency: if an identical active membership already exists, return it
  -- rather than duplicating. Prevents double-clicks from stacking rows.
  select id into _new_id
  from public.memberships
  where profile_id = _profile_id
    and role = _role
    and coalesce(state::text, '') = coalesce(_state::text, '')
    and coalesce(partner_center_id::text, '') = coalesce(_centre_id::text, '')
    and status = 'active'
  limit 1;

  if _new_id is null then
    insert into public.memberships (profile_id, role, state, partner_center_id, expires_at, status)
    values (_profile_id, _role, _state, _centre_id, _expires_at, 'active')
    returning id into _new_id;
  end if;

  return query
  select m.id, m.profile_id, m.role::text, m.state::text, m.partner_center_id
  from public.memberships m where m.id = _new_id;
end;
$fn$;

grant execute on function public.admin_grant_membership(uuid, public.membership_role, public.my_state, uuid, date)
  to authenticated;
