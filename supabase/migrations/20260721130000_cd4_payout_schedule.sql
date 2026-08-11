-- 20260721130000_cd4_payout_schedule.sql
--
-- Creates public.payout_schedule to hold the CD-4 assessment payout schedule
-- ratified by the Committee on 18 July 2026 (Manual Appendix D CD-4,
-- reflected in Appendix F "Examiner payout" row).
--
-- Semantic split from fee_schedule:
--   fee_schedule    = per-level total paid IN by the requesting party
--                     (existing table, unchanged, cited in Manual §16 as
--                     the customer-facing fee)
--   payout_schedule = the four function-based components paid OUT per
--                     candidate per session (examiner + instructor + hosting
--                     + MAS retention), per CD-4
--
-- Shape: one row per level_band ('L1_L3', 'L4_L7'). Four component amounts
-- as columns plus a generated total. Only 2 rows total; the Portal reads all
-- four components at once for every payout computation, so this beats a
-- one-row-per-component design.
--
-- Governance references:
--   Manual §16 (fee/payout framework)
--   Manual Appendix D CD-4 (ratified schedule)
--   Manual Appendix F ("Examiner payout" row — points here as authoritative)

-- ============ 1 · Table ============
create table if not exists public.payout_schedule (
  level_band       text primary key
                     check (level_band in ('L1_L3', 'L4_L7')),
  examiner_rm      numeric(8,2) not null check (examiner_rm      >= 0),
  instructor_rm    numeric(8,2) not null check (instructor_rm    >= 0),
  hosting_rm       numeric(8,2) not null check (hosting_rm       >= 0),
  mas_retention_rm numeric(8,2) not null check (mas_retention_rm >= 0),
  total_rm         numeric(8,2) generated always as
                     (examiner_rm + instructor_rm + hosting_rm + mas_retention_rm) stored,
  effective_from   date         not null default current_date,
  updated_at       timestamptz  not null default now()
);

comment on table  public.payout_schedule is
  'CD-4 assessment payout schedule (Manual Appendix D CD-4). Two rows: level bands L1_L3 and L4_L7. Components: examiner + instructor + hosting + MAS retention. Total is generated.';

comment on column public.payout_schedule.examiner_rm      is 'Paid to the assigned examiner per candidate per session.';
comment on column public.payout_schedule.instructor_rm    is 'Paid to the booking instructor per candidate per session.';
comment on column public.payout_schedule.hosting_rm       is 'Paid to the venue provider of record: partner centre when session runs at a recognised centre, instructor when at an unattached venue they arrange, or MAS when MAS-hosted.';
comment on column public.payout_schedule.mas_retention_rm is 'MAS retention — the residual component funding programme administration and cross-state deployment reserves.';

-- ============ 2 · RLS ============
alter table public.payout_schedule enable row level security;

-- Read: anyone authenticated (all portal roles need to see payout values in
-- session detail and reporting). No parent access — parents shouldn't see
-- payout components, but the payout_schedule isn't tied to a candidate, so
-- read of the schedule table itself is harmless.
drop policy if exists payout_schedule_read on public.payout_schedule;
create policy payout_schedule_read
  on public.payout_schedule
  for select
  to authenticated
  using (true);

-- Write: only chairperson / system_admin. Per Manual §16, the Chairperson
-- proposes; Board ratifies. Portal enforcement is on Chairperson write.
-- Any change is logged via updated_at; audit trail lives in the Manual
-- Appendix D CD number.
drop policy if exists payout_schedule_write on public.payout_schedule;
create policy payout_schedule_write
  on public.payout_schedule
  for all
  to authenticated
  using  (public.has_role('chairperson') or public.has_role('system_admin'))
  with check (public.has_role('chairperson') or public.has_role('system_admin'));

-- ============ 3 · Seed CD-4 values ============
-- Ratified 18 July 2026, per Manual Appendix D CD-4:
--   L1_L3 (Starfish/Guppy/Frog):        RM 10/10/10/20 = RM 50 total
--   L4_L7 (Octopus/Sea Turtle/          RM 15/15/15/30 = RM 75 total
--          Swordfish/Dolphin):
--
-- Idempotent: on conflict, updates amounts and updated_at.
insert into public.payout_schedule
  (level_band, examiner_rm, instructor_rm, hosting_rm, mas_retention_rm, effective_from)
values
  ('L1_L3', 10.00, 10.00, 10.00, 20.00, date '2026-07-18'),
  ('L4_L7', 15.00, 15.00, 15.00, 30.00, date '2026-07-18')
on conflict (level_band) do update set
  examiner_rm      = excluded.examiner_rm,
  instructor_rm    = excluded.instructor_rm,
  hosting_rm       = excluded.hosting_rm,
  mas_retention_rm = excluded.mas_retention_rm,
  effective_from   = excluded.effective_from,
  updated_at       = now();

-- ============ 4 · Helper function ============
-- Maps a badge_level to its level_band so RPCs computing per-session
-- payouts don't need to hardcode the band split. Immutable.
create or replace function public.badge_level_to_band(_level public.badge_level)
returns text
language sql immutable
as $$
  select case
    when _level in ('starfish', 'guppy', 'frog') then 'L1_L3'
    when _level in ('octopus', 'sea_turtle', 'swordfish', 'dolphin') then 'L4_L7'
    else null
  end;
$$;
grant execute on function public.badge_level_to_band(public.badge_level) to authenticated;
