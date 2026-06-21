-- ============================================================================
-- Migration: 20260621093000_partner_centers
-- Phase:     1 — Registry foundation
-- Purpose:   Recognition registry for swim schools / clubs / academies.
--            Partner Center status is OPTIONAL for participation (a MAS
--            instructor can submit candidates without one) — this table is
--            specifically the recognition register and the source of the
--            public directory.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

-- Malaysian states + federal territories. Reused later by examiner state pools.
create type public.my_state as enum (
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor',
  'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya'
);

-- Partner Center recognition lifecycle.
--   pending     applied, under documentary review (not yet recognized)
--   recognized  active; the ONLY status shown in the public directory
--   suspended   temporarily barred; record retained, NOT publicly disclosed
--   removed     removed; reapplication allowed after the cooling period
create type public.partner_center_status as enum (
  'pending', 'recognized', 'suspended', 'removed'
);


-- ----------------------------------------------------------------------------
-- partner_centers
-- ----------------------------------------------------------------------------
create table public.partner_centers (
  id                   uuid                          primary key default gen_random_uuid(),
  name                 text                          not null,
  state                public.my_state               not null,
  status               public.partner_center_status  not null default 'pending',
  principal_profile_id uuid                          references public.profiles (id) on delete set null,
  contact_email        text,
  contact_phone        text,
  address              text,
  recognized_at        date,   -- set when status -> recognized; drives annual-return anniversary
  created_at           timestamptz                   not null default now(),
  updated_at           timestamptz                   not null default now()
);

comment on table public.partner_centers is
  'Recognition register for swim schools/clubs/academies. Optional for participation; source of the public directory.';
comment on column public.partner_centers.status is
  'Lifecycle. Only `recognized` is publicly listed. `suspended` is retained but not disclosed.';
comment on column public.partner_centers.principal_profile_id is
  'The principal/controlling person, once they hold an account. Nullable: a center may be registered before the principal signs up.';
comment on column public.partner_centers.recognized_at is
  'Date recognition was granted. Anniversary drives the Annual Return cycle.';

create index partner_centers_state_idx  on public.partner_centers (state);
create index partner_centers_status_idx on public.partner_centers (status);

create trigger partner_centers_set_updated_at
  before update on public.partner_centers
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- Row Level Security — BASELINE ONLY
--
--   Role-based management (Chairperson recognizes/suspends, Chief Examiner
--   audits) and the anonymous public directory both depend on has_role(),
--   which arrives with the `memberships` migration. Those policies are layered
--   on in a later migration — NOT by loosening what's here.
--
--   For now: RLS on, and the linked principal can read their own center's
--   record. Nothing else is exposed; deny-by-default handles the rest.
-- ----------------------------------------------------------------------------
alter table public.partner_centers enable row level security;

create policy "partner_centers_select_own_principal"
  on public.partner_centers
  for select
  to authenticated
  using ( (select auth.uid()) = principal_profile_id );

-- No write policies yet by design: recognition state transitions are a
--   Chairperson action, added with has_role() in a later migration.
