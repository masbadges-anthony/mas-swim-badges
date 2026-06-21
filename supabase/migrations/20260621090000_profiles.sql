-- ============================================================================
-- Migration: 20260621090000_profiles
-- Phase:     1 — Registry foundation
-- Purpose:   Person records for authenticated adults (1:1 with auth.users).
--            Also establishes the reusable updated_at trigger used by every
--            later table.
--
-- IMPORTANT: Minors are NEVER auth users and NEVER appear here. They live in
--            the `candidates` table (later migration) as claimable records.
--            profiles = adults only.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Reusable helper: stamp updated_at = now() on any table that has the column.
--    Defined here once; reused by profiles and every future table.
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.handle_updated_at() is
  'Generic BEFORE UPDATE trigger fn: stamps updated_at = now(). Reused across tables.';


-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  email       text,                        -- denormalised copy, seeded at signup
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One record per authenticated adult. 1:1 with auth.users. Minors are not here.';
comment on column public.profiles.email is
  'Convenience copy seeded from auth.users at signup. auth.users stays source of truth.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- 2. Auto-provision a profile when a new auth user signs up.
--
--    SECURITY DEFINER + `set search_path = ''` is the hardened Supabase pattern:
--      - definer rights let the function insert past profiles RLS;
--      - empty search_path forces fully-qualified names (public.*, auth.*),
--        closing the search_path-injection hole that an unqualified function
--        would leave open.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT on auth.users: creates the matching public.profiles row.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 3. Row Level Security
--    No table ships without RLS. Profiles are private to their owner for now.
--    Cross-role reads (e.g. a Chief Examiner viewing an examiner's contact
--    details) are added later in the memberships migration via has_role(),
--    NOT by loosening these policies.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Read your own profile.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ( (select auth.uid()) = id );

-- Update your own profile.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

-- No INSERT policy by design: rows are created only by handle_new_user()
--   (security definer, bypasses RLS).
-- No DELETE policy by design: profile lifecycle follows auth.users via
--   ON DELETE CASCADE. Removing a person is an auth-layer action.
