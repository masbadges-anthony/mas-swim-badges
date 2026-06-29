-- 20260629150000_fee_schedule.sql
-- #12 Assessment Workflow Redesign — migration 2 of N (leaf, additive, no live-trigger touch).
--
-- Authoritative per-level assessment fee (Portal is operationally authoritative — Decision R3).
-- Seeded from Manual §14.1: Levels 1-3 = RM50, Levels 4-7 = RM75.
-- Writes are sysadmin-only; reads are open to authenticated (fee display, invoice computation).

create table if not exists public.fee_schedule (
  level       badge_level    primary key,
  fee_rm      numeric(8,2)   not null check (fee_rm >= 0),
  updated_by  uuid           references public.profiles(id),
  updated_at  timestamptz    not null default now()
);

-- Seed all seven levels. (See migration note: Dolphin/L7 seeded at the L4-7 band; adjust if
-- the top award is non-assessable.)
insert into public.fee_schedule (level, fee_rm) values
  ('starfish',   50.00),   -- L1
  ('sea_turtle', 50.00),   -- L2
  ('guppy',      50.00),   -- L3
  ('octopus',    75.00),   -- L4
  ('frog',       75.00),   -- L5
  ('swordfish',  75.00),   -- L6
  ('dolphin',    75.00)    -- L7
on conflict (level) do nothing;

alter table public.fee_schedule enable row level security;

-- Read: any authenticated user (fee display, pro-forma/reconciliation math).
drop policy if exists fee_schedule_select on public.fee_schedule;
create policy fee_schedule_select on public.fee_schedule
  for select to authenticated
  using (true);

-- Write: sysadmin only.
drop policy if exists fee_schedule_write on public.fee_schedule;
create policy fee_schedule_write on public.fee_schedule
  for all to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));
