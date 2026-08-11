-- 20260710201000_store_tables.sql  (REWORK: extend-in-place)
--
-- Store module (S1, 2 of 3). The original store feature's tables pre-exist
-- (store_products with 6 live rows; store_orders / store_order_items empty;
-- RLS on, zero policies). This migration EXTENDS them in place:
--   • keeps every existing column name (unit_price, active, quantity, note,
--     tracking, ordered_by_profile_id; paid_at / fulfilled_at reused)
--   • store_orders.status: text -> store_order_status enum (safe: 0 rows)
--   • adds order_no, the structured shipping snapshot, invoice / payment /
--     shipment / cancellation actor+timestamp fields
--   • adds read policies (none existed - tables were fully locked)
--   • app_settings is NOT touched: it is the payout config surface
--     (examiner_base_per_candidate, examiner_travel_default) - Phase 2 owns it.
--     Feature flags get their own table: app_flags.
-- All writes still arrive via S2 definer RPCs; RLS grants reads only.

-- ---------- helper: who may see/operate all store orders ----------
create or replace function public.is_store_staff()
returns boolean
language sql stable security definer set search_path to ''
as $$
  select public.has_role('finance_officer')
      or public.has_role('system_admin')
      or public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('chief_examiner');
$$;
grant execute on function public.is_store_staff() to authenticated;

-- ---------- order number: ST-YYYY-NNNN (continuous, year-prefixed) ----------
create sequence if not exists public.store_order_no_seq;

create or replace function public.next_store_order_no()
returns text
language sql volatile security definer set search_path to ''
as $$
  select 'ST-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.store_order_no_seq')::text, 4, '0');
$$;

-- ---------- store_products: extend (6 live rows preserved) ----------
alter table public.store_products
  add column if not exists image_paths text[] not null default '{}',
  add column if not exists stock_qty   integer,
  add column if not exists updated_at  timestamptz not null default now();

alter table public.store_products
  drop constraint if exists store_products_stock_qty_chk;
alter table public.store_products
  add constraint store_products_stock_qty_chk
  check (stock_qty is null or stock_qty >= 0);

-- (no category CHECK added: existing rows' category values are live data;
--  the Settings UI supplies the fixed category list)

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists store_products_touch on public.store_products;
create trigger store_products_touch
  before update on public.store_products
  for each row execute function public.touch_updated_at();

-- ---------- store_orders: extend (0 rows - free hand) ----------
-- status: text -> enum. The legacy column carries text-comparing dependents
-- (CHECK constraint and/or index) that block the type change - drop them
-- first; the enum itself takes over the old CHECK's job.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.store_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.store_orders drop constraint %I', r.conname);
  end loop;

  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'store_orders'
      and indexdef ilike '%status%'
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;

alter table public.store_orders alter column status drop default;
alter table public.store_orders
  alter column status type public.store_order_status
  using status::public.store_order_status;
alter table public.store_orders
  alter column status set default 'submitted';

alter table public.store_orders
  add column if not exists order_no       text unique default public.next_store_order_no(),
  -- structured shipping snapshot (legacy shipping_address column left in place, unused)
  add column if not exists recipient_name text,
  add column if not exists phone          text,
  add column if not exists email          text,
  add column if not exists address_line1  text,
  add column if not exists address_line2  text,
  add column if not exists city           text,
  add column if not exists state          public.my_state,
  add column if not exists postcode       text,
  -- invoice (1:1 with the order; FO-generated)
  add column if not exists invoice_no     text unique,
  add column if not exists invoice_amount numeric(10,2),
  add column if not exists invoiced_at    timestamptz,
  add column if not exists invoiced_by    uuid references public.profiles(id),
  -- payment actors (paid_at already exists)
  add column if not exists paid_by        uuid references public.profiles(id),
  add column if not exists payment_ref    text,
  -- shipment actors (fulfilled_at = shipped timestamp; tracking already exists)
  add column if not exists shipped_by     uuid references public.profiles(id),
  -- cancellation
  add column if not exists cancelled_at   timestamptz,
  add column if not exists cancelled_by   uuid references public.profiles(id),
  add column if not exists cancel_reason  text;

alter table public.store_orders
  drop constraint if exists store_orders_invoice_amount_chk;
alter table public.store_orders
  add constraint store_orders_invoice_amount_chk
  check (invoice_amount is null or invoice_amount >= 0);

alter table public.store_orders
  drop constraint if exists store_orders_note_len_chk;
alter table public.store_orders
  add constraint store_orders_note_len_chk
  check (note is null or char_length(note) <= 200);

create index if not exists store_orders_ordered_by_idx
  on public.store_orders (ordered_by_profile_id);
create index if not exists store_orders_status_idx
  on public.store_orders (status);

-- ---------- store_order_items: one product per order line ----------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_order_items_order_product_uniq'
  ) then
    alter table public.store_order_items
      add constraint store_order_items_order_product_uniq
      unique (order_id, product_id);
  end if;
end $$;

create index if not exists store_order_items_order_idx
  on public.store_order_items (order_id);

-- ---------- app_flags: feature flags (app_settings belongs to payout config) ----------
create table if not exists public.app_flags (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.app_flags (key, enabled)
values ('store_enabled', true)
on conflict (key) do nothing;

alter table public.app_flags enable row level security;

-- ---------- policies (tables had RLS on with ZERO policies - all additive) ----------
drop policy if exists store_products_read   on public.store_products;
drop policy if exists store_products_insert on public.store_products;
drop policy if exists store_products_update on public.store_products;
drop policy if exists store_products_delete on public.store_products;

create policy store_products_read on public.store_products
  for select to authenticated
  using (active or public.is_store_staff());

create policy store_products_insert on public.store_products
  for insert to authenticated
  with check (public.has_role('system_admin'));

create policy store_products_update on public.store_products
  for update to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

create policy store_products_delete on public.store_products
  for delete to authenticated
  using (public.has_role('system_admin'));

drop policy if exists store_orders_read on public.store_orders;
create policy store_orders_read on public.store_orders
  for select to authenticated
  using (ordered_by_profile_id = auth.uid() or public.is_store_staff());

drop policy if exists store_order_items_read on public.store_order_items;
create policy store_order_items_read on public.store_order_items
  for select to authenticated
  using (exists (
    select 1 from public.store_orders o
    where o.id = order_id
      and (o.ordered_by_profile_id = auth.uid() or public.is_store_staff())
  ));

drop policy if exists app_flags_read  on public.app_flags;
drop policy if exists app_flags_write on public.app_flags;

create policy app_flags_read on public.app_flags
  for select to authenticated
  using (true);

create policy app_flags_write on public.app_flags
  for all to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

-- app_settings: readable (portal config mirrors Appendix F - parameters are
-- not secrets); writable by sysadmin only. Structure untouched.
drop policy if exists app_settings_read  on public.app_settings;
drop policy if exists app_settings_write on public.app_settings;

create policy app_settings_read on public.app_settings
  for select to authenticated
  using (true);

create policy app_settings_write on public.app_settings
  for all to authenticated
  using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));
