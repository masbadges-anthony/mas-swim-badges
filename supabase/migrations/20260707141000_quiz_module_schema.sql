-- 20260707141000_quiz_module_schema.sql
-- Onboarding quiz module — tables, config, RLS, seed.
-- Config-driven: draw size and pass mark live in quiz_config (mirrors Manual
-- Appendix F), so the standard changes here + in the Manual, never in code.

-- ── Question bank ──────────────────────────────────────────────────────────
create table if not exists public.quiz_question (
  id            uuid primary key default gen_random_uuid(),
  role_kind     public.role_kind not null,
  category      text not null,
  stem          text not null,
  options       text[] not null,
  correct_index int  not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint quiz_question_four_options check (array_length(options, 1) = 4),
  constraint quiz_question_correct_range check (correct_index between 0 and 3)
);
create index if not exists quiz_question_role_active_idx
  on public.quiz_question (role_kind) where active;

-- ── Quiz configuration (per role) ──────────────────────────────────────────
create table if not exists public.quiz_config (
  role_kind   public.role_kind primary key,
  draw_size   int not null default 10,
  pass_mark   int not null default 8,
  updated_at  timestamptz not null default now(),
  constraint quiz_config_sane check (pass_mark between 1 and draw_size)
);

-- ── Attempts ───────────────────────────────────────────────────────────────
create table if not exists public.quiz_attempt (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  role_kind     public.role_kind not null,
  question_ids  uuid[] not null,
  answers       int[],
  score         int,
  passed        boolean,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz
);
create index if not exists quiz_attempt_profile_idx
  on public.quiz_attempt (profile_id, role_kind, started_at desc);

-- ── Onboarding checkpoint (per profile per role) ───────────────────────────
create table if not exists public.onboarding_checkpoint (
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role_kind       public.role_kind not null,
  quiz_passed     boolean not null default false,
  quiz_passed_at  timestamptz,
  coc_version     text,
  coc_accepted_at timestamptz,
  activated       boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (profile_id, role_kind)
);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.quiz_question         enable row level security;
alter table public.quiz_config           enable row level security;
alter table public.quiz_attempt          enable row level security;
alter table public.onboarding_checkpoint enable row level security;

-- Questions and config are never read directly by clients (the RPCs are
-- SECURITY DEFINER and never expose correct_index pre-submission). Governance
-- may manage the bank.
drop policy if exists quiz_question_gov on public.quiz_question;
create policy quiz_question_gov on public.quiz_question
  for all using (public.has_role('chief_examiner') or public.has_role('system_admin')
             or public.has_role('chairperson'))
  with check (public.has_role('chief_examiner') or public.has_role('system_admin')
             or public.has_role('chairperson'));

drop policy if exists quiz_config_gov on public.quiz_config;
create policy quiz_config_gov on public.quiz_config
  for all using (public.has_role('system_admin') or public.has_role('chairperson'))
  with check (public.has_role('system_admin') or public.has_role('chairperson'));

-- A user reads only their own attempts; writes go through the RPCs.
drop policy if exists quiz_attempt_own on public.quiz_attempt;
create policy quiz_attempt_own on public.quiz_attempt
  for select using (profile_id = (select auth.uid())
             or public.has_role('chief_examiner') or public.has_role('system_admin'));

-- A user reads only their own checkpoint; governance reads all.
drop policy if exists onboarding_own on public.onboarding_checkpoint;
create policy onboarding_own on public.onboarding_checkpoint
  for select using (profile_id = (select auth.uid())
             or public.has_role('chief_examiner') or public.has_role('system_admin')
             or public.has_role('chairperson'));

-- ── Seed config to the Appendix F standard (10 drawn, pass 8) ───────────────
insert into public.quiz_config (role_kind, draw_size, pass_mark) values
  ('instructor', 10, 8),
  ('examiner',   10, 8)
on conflict (role_kind) do update
  set draw_size = excluded.draw_size,
      pass_mark = excluded.pass_mark,
      updated_at = now();
