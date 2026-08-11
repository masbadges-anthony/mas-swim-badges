-- 20260712100000_username_accounts.sql
--
-- Username-first accounts for role-holders who don't want an email inbox.
-- Under the hood the account is still a Supabase auth user; we generate an
-- internal email of the form `<username>@masbadges.internal` so Supabase Auth
-- treats it as any other account. The user never sees this address.
--
-- Login flow: the Login screen sends the raw input to resolve_login(); if
-- the input contains '@' it is returned as-is (real email path); otherwise
-- the RPC looks up the username and returns the internal email that Supabase
-- Auth can log in with. The mapping table username_credentials keeps
-- username → profile_id → auth email tied together.
--
-- Constraints:
--   • username: 3–32 chars, lowercase alphanumeric with underscore/dot
--   • unique globally
--   • cannot collide with the '@masbadges.internal' path of another user
--   • sysadmin-only creation (admin_create_username_account)

-- ---------- username identity table ----------
create table if not exists public.username_credentials (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  username    text not null unique
              check (username ~ '^[a-z0-9_.]{3,32}$'),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

create index if not exists username_credentials_username_idx
  on public.username_credentials (username);

alter table public.username_credentials enable row level security;

-- Readable by all authenticated users (Login resolves; account listings display)
create policy username_credentials_read on public.username_credentials
  for select to authenticated
  using (true);

-- No direct writes; RPC only.

-- ---------- Login resolver ----------
-- Public (anon-callable) because the Login screen has no session yet.
-- Returns the auth email to sign in with. Never returns password data.
-- For unknown usernames returns null; the client then shows a login error.
create or replace function public.resolve_login(_input text)
returns text
language plpgsql stable
set search_path to ''
as $$
declare
  _clean text := lower(trim(coalesce(_input, '')));
  _email text;
begin
  if _clean = '' then return null; end if;
  if position('@' in _clean) > 0 then
    return _clean;  -- already an email; caller uses as-is
  end if;
  select p.email into _email
  from public.username_credentials uc
  join public.profiles p on p.id = uc.profile_id
  where uc.username = _clean;
  return _email;
end;
$$;
grant execute on function public.resolve_login(text) to anon, authenticated;

-- ---------- Sysadmin creation path ----------
-- Uses admin_create_account_with_password under the hood by generating the
-- internal email server-side. Returns the new profile_id.
--
-- Wrapper is a plpgsql function that:
--   1. Validates the username shape.
--   2. Checks it isn't already taken.
--   3. Synthesises <username>@masbadges.internal.
--   4. Delegates to admin_create_account_with_password.
--   5. Records the username → profile mapping.
create or replace function public.admin_create_username_account(
  p_username     text,
  p_password     text,
  p_role         public.membership_role,
  p_state        public.my_state,
  p_display_name text
)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  _clean     text := lower(trim(coalesce(p_username, '')));
  _email     text;
  _profile   uuid;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;

  if _clean !~ '^[a-z0-9_.]{3,32}$' then
    raise exception 'Username must be 3-32 lowercase letters, digits, underscore, or dot.';
  end if;

  if exists (select 1 from public.username_credentials where username = _clean) then
    raise exception 'Username % is already taken.', _clean;
  end if;

  _email := _clean || '@masbadges.internal';

  if exists (select 1 from public.profiles where email = _email) then
    raise exception 'Internal account collision for username %.', _clean;
  end if;

  -- Delegate account creation (auth user, profile, initial role membership)
  _profile := public.admin_create_account_with_password(
    p_email     := _email,
    p_password  := p_password,
    p_role      := p_role,
    p_state     := p_state,
    p_full_name := p_display_name
  );

  insert into public.username_credentials (profile_id, username, created_by)
  values (_profile, _clean, auth.uid());

  return _profile;
end;
$$;
grant execute on function public.admin_create_username_account(text, text, public.membership_role, public.my_state, text) to authenticated;

-- ---------- Extend the account listing with the username column ----------
-- list_provisioned_accounts is already in the codebase; we can't alter its
-- return shape without breaking the current Accounts UI. Ship a companion
-- that also exposes the username when present. The Settings UI will call
-- this alongside the existing list.
create or replace function public.list_account_usernames()
returns table (profile_id uuid, username text)
language sql stable security definer set search_path to ''
as $$
  select profile_id, username from public.username_credentials;
$$;
grant execute on function public.list_account_usernames() to authenticated;
