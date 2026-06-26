-- 20260626120000_content_overrides.sql
--
-- Content overrides: the database layer for an admin-only inline text-editing
-- feature. A system administrator can override a piece of marketing copy by key
-- (e.g. "home.hero.title") without a code deploy; the public site reads the
-- overrides one-way and substitutes them when present.
--
--   content_overrides             — table, public-readable, system_admin-only writes
--   public_content_overrides (view) — PUBLIC: key + value ONLY (no audit/user data)
--   set_content_override(key,value) — SECURITY DEFINER upsert, system_admin-gated
--
-- Producer/consumer law: the portal (producer) writes overrides via the gated
-- RPC; the public site (consumer) reads them through the read-only view. No user
-- or minor data is ever exposed — the public surface carries only key and value.
--
-- Admin check uses the project's existing has_role('system_admin'); the
-- system_admin wildcard (20260622160000) means that role passes every check.

-- ----------------------------------------------------------------------------
-- 1. content_overrides
--    key is the stable lookup id used by the frontend; value is the override
--    text. Audit columns follow the role_catalog convention
--    (updated_by_profile_id -> profiles, updated_at stamped by the shared trigger).
-- ----------------------------------------------------------------------------
create table if not exists public.content_overrides (
  key                   text primary key,
  value                 text not null,
  updated_by_profile_id uuid references public.profiles(id),
  updated_at            timestamptz not null default now()
);

comment on table public.content_overrides is
  'Admin-only inline copy overrides, keyed by a stable slug (e.g. "home.hero.title"). Public-readable; writes are system_admin-only.';

drop trigger if exists trg_content_overrides_updated_at on public.content_overrides;
create trigger trg_content_overrides_updated_at
  before update on public.content_overrides
  for each row execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Row Level Security
--    Read: anyone, including anonymous. Write: system_admin only.
-- ----------------------------------------------------------------------------
alter table public.content_overrides enable row level security;

-- Anyone (anon + authenticated) may read every override row.
drop policy if exists content_overrides_select_public on public.content_overrides;
create policy content_overrides_select_public
  on public.content_overrides for select
  to anon, authenticated
  using (true);

-- Only a system administrator may insert.
drop policy if exists content_overrides_insert_admin on public.content_overrides;
create policy content_overrides_insert_admin
  on public.content_overrides for insert
  to authenticated
  with check (public.has_role('system_admin'));

-- Only a system administrator may update.
drop policy if exists content_overrides_update_admin on public.content_overrides;
create policy content_overrides_update_admin
  on public.content_overrides for update
  to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

-- Only a system administrator may delete.
drop policy if exists content_overrides_delete_admin on public.content_overrides;
create policy content_overrides_delete_admin
  on public.content_overrides for delete
  to authenticated
  using (public.has_role('system_admin'));

grant select on public.content_overrides to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Public read surface (matches the public_courses pattern)
--    The canonical one-way read the public site consumes: key + value ONLY.
--    Deliberately omits updated_by_profile_id / updated_at so no user data
--    crosses the producer/consumer boundary.
-- ----------------------------------------------------------------------------
create or replace view public.public_content_overrides as
select key, value
from public.content_overrides;

grant select on public.public_content_overrides to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. set_content_override — SECURITY DEFINER upsert, system_admin-gated.
--    Returns the affected row as the table's composite type, which sidesteps
--    any RETURNS TABLE column-name collision: the OUT shape is the row type and
--    the inserted/updated tuple is captured into a distinctly-named local
--    variable (_row), so there is no ambiguity between output and table columns.
-- ----------------------------------------------------------------------------
create or replace function public.set_content_override(_key text, _value text)
returns public.content_overrides
language plpgsql
security definer
set search_path to ''
as $$
declare
  _row public.content_overrides;
begin
  if not public.has_role('system_admin') then
    raise exception 'Only a system administrator may edit content overrides.';
  end if;

  if length(coalesce(trim(_key), '')) = 0 then
    raise exception 'A content override key is required.';
  end if;

  insert into public.content_overrides as co (key, value, updated_by_profile_id)
  values (trim(_key), coalesce(_value, ''), (select auth.uid()))
  on conflict (key) do update
    set value                 = excluded.value,
        updated_by_profile_id = (select auth.uid())
        -- updated_at is stamped by trg_content_overrides_updated_at
  returning co.* into _row;

  return _row;
end;
$$;

grant execute on function public.set_content_override(text, text) to authenticated;
