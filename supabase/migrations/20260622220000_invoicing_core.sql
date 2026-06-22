-- 20260622220000_invoicing_core.sql
--
-- Invoicing core for assessments. Five tables:
--   assessment_fees  — per-level price (seeded from Manual §14.1). sysadmin-managed.
--   app_settings     — tunables incl. examiner payout rates (D3). sysadmin-managed.
--   invoices         — one per session; instructor-facing (what they pay).
--   invoice_items    — assessment-fee lines + venue/adjustments.
--   payments         — inbound (instructor->MAS) AND payout (MAS->examiner).
--
-- VISIBILITY (matches the design): the whole billing surface is system_admin-only
-- (Accounts/Settings invisible to instructor/centre). The ONE exception is that an
-- instructor (and their centre admin) may SELECT their own invoice + its items, so
-- they can see the pro-forma confirmation, final invoice, and receipt number.
--
-- The examiner payout is deliberately NOT on the instructor invoice — it is an
-- internal cost tracked in payments(direction='payout'), so it can never leak onto
-- a document the instructor can read.
--
-- has_role('system_admin') is the gate; via the wildcard a system_admin passes it,
-- and (importantly) chairperson/board do NOT — this stays a pure staff surface.
-- Grant a chairperson system_admin if they need billing access.

-- ----- assessment_fees -------------------------------------------------------
create table if not exists public.assessment_fees (
  level      public.badge_level primary key,
  amount     numeric(10,2) not null,
  updated_at timestamptz not null default now()
);

insert into public.assessment_fees (level, amount) values
  ('starfish',   50.00),
  ('sea_turtle', 50.00),
  ('guppy',      50.00),
  ('octopus',    75.00),
  ('frog',       75.00),
  ('swordfish',  75.00),
  ('dolphin',    75.00)
on conflict (level) do nothing;

-- ----- app_settings (numeric tunables) ---------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- examiner payout structure (D3): per-candidate base + default travel allowance.
-- Quantum set later in the Settings screen; seeded at 0 so the keys exist.
insert into public.app_settings (key, value) values
  ('examiner_base_per_candidate', 0),
  ('examiner_travel_default',     0)
on conflict (key) do nothing;

-- ----- invoices --------------------------------------------------------------
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null unique references public.assessment_sessions(id) on delete cascade,
  bill_to_profile_id uuid references public.profiles(id),
  partner_center_id  uuid references public.partner_centers(id),
  status             text not null default 'pro_forma'
                       check (status in ('pro_forma','issued','paid','void')),
  subtotal           numeric(10,2) not null default 0,
  total              numeric(10,2) not null default 0,
  currency           text not null default 'MYR',
  receipt_no         text,
  issued_at          timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.handle_updated_at();

-- ----- invoice_items ---------------------------------------------------------
create table if not exists public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  item_type    text not null
                 check (item_type in ('assessment_fee','venue_surcharge','adjustment','material','other')),
  description  text,
  level        public.badge_level,
  candidate_id uuid references public.candidates(id) on delete set null,
  quantity     numeric(10,2) not null default 1,
  unit_amount  numeric(10,2) not null,
  amount       numeric(10,2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);

-- ----- payments --------------------------------------------------------------
create table if not exists public.payments (
  id                     uuid primary key default gen_random_uuid(),
  direction              text not null check (direction in ('inbound','payout')),
  invoice_id             uuid references public.invoices(id) on delete set null,   -- inbound
  session_id             uuid references public.assessment_sessions(id) on delete set null, -- payout
  payee_profile_id       uuid references public.profiles(id),                      -- payout: the examiner
  amount                 numeric(10,2) not null,
  method                 text,
  reference              text,   -- proof / receipt reference
  recorded_by_profile_id uuid references public.profiles(id),
  recorded_at            timestamptz not null default now(),
  note                   text
);

create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists payments_session_idx on public.payments(session_id);

-- ===== RLS ===================================================================
alter table public.assessment_fees enable row level security;
alter table public.app_settings   enable row level security;
alter table public.invoices       enable row level security;
alter table public.invoice_items  enable row level security;
alter table public.payments       enable row level security;

-- assessment_fees / app_settings: system_admin only (definer fns read past RLS)
create policy assessment_fees_all_admin on public.assessment_fees for all
  using (public.has_role('system_admin')) with check (public.has_role('system_admin'));
create policy app_settings_all_admin on public.app_settings for all
  using (public.has_role('system_admin')) with check (public.has_role('system_admin'));

-- invoices: instructor (own) + their centre admin + system_admin may SELECT;
-- only system_admin may write.
create policy invoices_select_visible on public.invoices for select
  using (
    bill_to_profile_id = (select auth.uid())
    or (partner_center_id is not null and public.has_role('partner_center_admin', partner_center_id))
    or public.has_role('system_admin')
  );
create policy invoices_insert_admin on public.invoices for insert
  with check (public.has_role('system_admin'));
create policy invoices_update_admin on public.invoices for update
  using (public.has_role('system_admin'));

-- invoice_items: visible if the parent invoice is visible; writes system_admin only
create policy invoice_items_select_visible on public.invoice_items for select
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and (
        i.bill_to_profile_id = (select auth.uid())
        or (i.partner_center_id is not null and public.has_role('partner_center_admin', i.partner_center_id))
        or public.has_role('system_admin')
      )
  ));
create policy invoice_items_insert_admin on public.invoice_items for insert
  with check (public.has_role('system_admin'));
create policy invoice_items_update_admin on public.invoice_items for update
  using (public.has_role('system_admin'));
create policy invoice_items_delete_admin on public.invoice_items for delete
  using (public.has_role('system_admin'));

-- payments: system_admin only (inbound and payout are both internal finance)
create policy payments_all_admin on public.payments for all
  using (public.has_role('system_admin')) with check (public.has_role('system_admin'));
