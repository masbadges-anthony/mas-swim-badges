-- 20260713100000_sysadmin_capabilities_and_resources.sql
--
-- Two additions:
--
-- (A) Sysadmin membership revoke + account deletion:
--     - admin_revoke_membership(_membership_id)   sets status = 'revoked'
--     - admin_delete_account(_profile_id)         removes the user entirely
--       (auth.users + profiles cascade). Guarded against self-delete and
--       against removing the last active system_admin.
--
-- (B) Resources module — role-tagged document library:
--     resources                   the catalogue (title, description, URL,
--                                 Lucide icon name, category, sort, active)
--     resource_role_visibility    many-to-many resource ↔ role
--     resource_upsert / resource_set_visibility / resource_delete   sysadmin
--     list_my_resources()         every authenticated user; returns only
--                                 resources tagged for any of the caller's
--                                 active roles, deduplicated

-- ============ (A) MEMBERSHIP REVOKE + ACCOUNT DELETION ============

create or replace function public.admin_revoke_membership(_membership_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _mrow public.memberships%rowtype;
  _active_sysadmins int;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;

  select * into _mrow from public.memberships where id = _membership_id;
  if not found then
    raise exception 'Membership not found.';
  end if;

  -- Guard: cannot revoke the last active system_admin membership.
  if _mrow.role = 'system_admin' and _mrow.status = 'active' then
    select count(*) into _active_sysadmins
    from public.memberships
    where role = 'system_admin' and status = 'active';
    if _active_sysadmins <= 1 then
      raise exception 'Cannot revoke the last active system_admin.';
    end if;
  end if;

  update public.memberships
     set status = 'revoked',
         updated_at = now()
   where id = _membership_id;

  perform public.log_account_event(
    'membership_revoke',
    _mrow.profile_id,
    jsonb_build_object('membership_id', _membership_id, 'role', _mrow.role)
  );
end;
$$;
grant execute on function public.admin_revoke_membership(uuid) to authenticated;

create or replace function public.admin_delete_account(_profile_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _active_sysadmins int;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;

  if _profile_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  -- Guard: cannot delete the last active system_admin.
  if exists (
    select 1 from public.memberships
    where profile_id = _profile_id
      and role = 'system_admin'
      and status = 'active'
  ) then
    select count(*) into _active_sysadmins
    from public.memberships
    where role = 'system_admin' and status = 'active';
    if _active_sysadmins <= 1 then
      raise exception 'Cannot delete the last active system_admin.';
    end if;
  end if;

  perform public.log_account_event(
    'account_delete', _profile_id, '{}'::jsonb
  );

  -- Delete order matters: dependent rows first, then profile, then auth user.
  -- Most tables cascade off profiles, but username_credentials was defined with
  -- on delete cascade, so it clears with the profile.
  delete from public.memberships where profile_id = _profile_id;
  delete from public.profiles     where id = _profile_id;
  delete from auth.users          where id = _profile_id;
end;
$$;
grant execute on function public.admin_delete_account(uuid) to authenticated;

-- ============ (B) RESOURCES ============

create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  url          text not null,
  icon         text not null default 'file',   -- Lucide icon name (curated set)
  category     text not null default 'other'
               check (category in ('manual','handbook','guide','form','other')),
  sort_order   integer not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id)
);

create table if not exists public.resource_role_visibility (
  resource_id  uuid not null references public.resources(id) on delete cascade,
  role         public.membership_role not null,
  primary key (resource_id, role)
);

create index if not exists resource_role_visibility_role_idx
  on public.resource_role_visibility (role);

-- Touch trigger
drop trigger if exists resources_touch on public.resources;
create trigger resources_touch
  before update on public.resources
  for each row execute function public.touch_updated_at();

alter table public.resources enable row level security;
alter table public.resource_role_visibility enable row level security;

-- Reads: any authenticated user (the my-resources RPC does the actual filter).
create policy resources_read on public.resources
  for select to authenticated using (true);
create policy resource_role_visibility_read on public.resource_role_visibility
  for select to authenticated using (true);
-- No direct writes; RPCs only.

-- The user's view. Returns each resource once even if multiple of the caller's
-- roles grant access. Ordered by category then sort_order then title.
create or replace function public.list_my_resources()
returns table (
  id          uuid,
  title       text,
  description text,
  url         text,
  icon        text,
  category    text,
  sort_order  integer
)
language sql stable security definer set search_path to ''
as $$
  select distinct r.id, r.title, r.description, r.url, r.icon, r.category, r.sort_order
  from public.resources r
  join public.resource_role_visibility v on v.resource_id = r.id
  join public.memberships m on m.role = v.role
  where r.is_active
    and m.profile_id = auth.uid()
    and m.status = 'active'
  order by r.category, r.sort_order, r.title;
$$;
grant execute on function public.list_my_resources() to authenticated;

-- Sysadmin overview: every resource with its visibility roles aggregated.
create or replace function public.list_resources_admin()
returns table (
  id           uuid,
  title        text,
  description  text,
  url          text,
  icon         text,
  category     text,
  sort_order   integer,
  is_active    boolean,
  roles        text[]
)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;
  return query
    select r.id, r.title, r.description, r.url, r.icon, r.category,
           r.sort_order, r.is_active,
           coalesce(array_agg(v.role::text order by v.role) filter (where v.role is not null), '{}')
    from public.resources r
    left join public.resource_role_visibility v on v.resource_id = r.id
    group by r.id
    order by r.category, r.sort_order, r.title;
end;
$$;
grant execute on function public.list_resources_admin() to authenticated;

-- Upsert (create if _id null, else update).
create or replace function public.resource_upsert(
  _id          uuid,
  _title       text,
  _description text,
  _url         text,
  _icon        text,
  _category    text,
  _sort_order  integer,
  _is_active   boolean
)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  _new_id uuid;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;

  if coalesce(trim(_title), '') = '' or coalesce(trim(_url), '') = '' then
    raise exception 'Title and URL are required.';
  end if;

  if _id is null then
    insert into public.resources
      (title, description, url, icon, category, sort_order, is_active, updated_by)
    values
      (trim(_title), nullif(trim(coalesce(_description,'')), ''), trim(_url),
       coalesce(nullif(trim(_icon), ''), 'file'),
       coalesce(_category, 'other'),
       coalesce(_sort_order, 100),
       coalesce(_is_active, true),
       auth.uid())
    returning id into _new_id;
    return _new_id;
  end if;

  update public.resources
     set title       = trim(_title),
         description = nullif(trim(coalesce(_description,'')), ''),
         url         = trim(_url),
         icon        = coalesce(nullif(trim(_icon), ''), 'file'),
         category    = coalesce(_category, category),
         sort_order  = coalesce(_sort_order, sort_order),
         is_active   = coalesce(_is_active, is_active),
         updated_by  = auth.uid()
   where id = _id;
  return _id;
end;
$$;
grant execute on function public.resource_upsert(uuid, text, text, text, text, text, integer, boolean) to authenticated;

-- Replace the full visibility set for a resource (roles: text[]).
create or replace function public.resource_set_visibility(
  _resource_id uuid,
  _roles       text[]
)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;

  delete from public.resource_role_visibility where resource_id = _resource_id;
  if _roles is not null and array_length(_roles, 1) > 0 then
    insert into public.resource_role_visibility (resource_id, role)
    select _resource_id, r::public.membership_role
    from unnest(_roles) r;
  end if;
end;
$$;
grant execute on function public.resource_set_visibility(uuid, text[]) to authenticated;

create or replace function public.resource_delete(_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;
  delete from public.resources where id = _id;
end;
$$;
grant execute on function public.resource_delete(uuid) to authenticated;
