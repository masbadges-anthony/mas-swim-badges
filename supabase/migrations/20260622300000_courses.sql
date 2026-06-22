-- 20260622300000_courses.sql
--
-- Courses: the Supabase-backed schedule for instructor/examiner certification
-- courses and clinics. Serves both the public website's schedule and a future
-- in-portal calendar, and feeds the onboarding loop (a certified graduate is
-- then invited via instructor onboarding).
--
--   courses                 — table, RLS-managed by trainers/governance
--   public_courses (view)   — PUBLIC: published courses only
--
-- Manage (insert/update): instructor_trainer, examiner_trainer, chairperson,
-- board_member. Delete: chairperson/board only. Public sees published rows.

create table if not exists public.courses (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null
                          check (kind in ('instructor_certification',
                                          'examiner_certification',
                                          'clinic', 'other')),
  title                 text not null,
  description           text,
  state                 my_state,
  venue                 text,
  starts_on             date not null,
  ends_on               date,
  capacity              integer,
  fee                   numeric,
  registration_url      text,
  is_published          boolean not null default false,
  created_by_profile_id uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists courses_starts_on_idx on public.courses (starts_on);

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.handle_updated_at();

alter table public.courses enable row level security;

-- Managers can see everything (including unpublished drafts).
drop policy if exists courses_select_manage on public.courses;
create policy courses_select_manage
  on public.courses for select
  using (
       public.has_role('instructor_trainer')
    or public.has_role('examiner_trainer')
    or public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

drop policy if exists courses_insert on public.courses;
create policy courses_insert
  on public.courses for insert
  with check (
       public.has_role('instructor_trainer')
    or public.has_role('examiner_trainer')
    or public.has_role('chairperson')
    or public.has_role('board_member')
  );

drop policy if exists courses_update on public.courses;
create policy courses_update
  on public.courses for update
  using (
       public.has_role('instructor_trainer')
    or public.has_role('examiner_trainer')
    or public.has_role('chairperson')
    or public.has_role('board_member')
  )
  with check (
       public.has_role('instructor_trainer')
    or public.has_role('examiner_trainer')
    or public.has_role('chairperson')
    or public.has_role('board_member')
  );

drop policy if exists courses_delete on public.courses;
create policy courses_delete
  on public.courses for delete
  using (public.has_role('chairperson') or public.has_role('board_member'));

-- Public, published-only view.
create or replace view public.public_courses as
select id, kind, title, description, state, venue,
       starts_on, ends_on, capacity, fee, registration_url
from public.courses
where is_published = true;

grant select on public.public_courses to anon, authenticated;
