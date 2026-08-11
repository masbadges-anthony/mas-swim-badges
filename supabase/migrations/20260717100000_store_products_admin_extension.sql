-- 20260717100000_store_products_admin_extension.sql
--
-- Store product management moves from sysadmin-only to Finance Officer +
-- sysadmin. FO becomes the primary curator; sysadmin retains oversight.
--
-- Three changes:
--   1. Add sku column (nullable) for internal stock coding.
--   2. Widen RLS on store_products and the store-products bucket to include
--      finance_officer.
--   3. Add reorder_store_products RPC — atomic renumbering of sort_order
--      values from a supplied ordered list of product IDs. Used by the
--      drag-and-drop card grid.

-- ---------- schema: sku ----------
alter table public.store_products
  add column if not exists sku text;

create index if not exists store_products_sku_idx
  on public.store_products (sku)
  where sku is not null;

-- ---------- policies: widen writes to FO ----------
drop policy if exists store_products_insert on public.store_products;
drop policy if exists store_products_update on public.store_products;
drop policy if exists store_products_delete on public.store_products;

create policy store_products_insert on public.store_products
  for insert to authenticated
  with check (public.has_role('system_admin') or public.has_role('finance_officer'));

create policy store_products_update on public.store_products
  for update to authenticated
  using       (public.has_role('system_admin') or public.has_role('finance_officer'))
  with check  (public.has_role('system_admin') or public.has_role('finance_officer'));

create policy store_products_delete on public.store_products
  for delete to authenticated
  using (public.has_role('system_admin') or public.has_role('finance_officer'));

-- ---------- storage bucket policies: same widening ----------
drop policy if exists store_products_img_insert on storage.objects;
drop policy if exists store_products_img_update on storage.objects;
drop policy if exists store_products_img_delete on storage.objects;

create policy store_products_img_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-products'
              and (public.has_role('system_admin') or public.has_role('finance_officer')));

create policy store_products_img_update on storage.objects
  for update to authenticated
  using       (bucket_id = 'store-products'
              and (public.has_role('system_admin') or public.has_role('finance_officer')))
  with check  (bucket_id = 'store-products'
              and (public.has_role('system_admin') or public.has_role('finance_officer')));

create policy store_products_img_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-products'
         and (public.has_role('system_admin') or public.has_role('finance_officer')));

-- ---------- reorder: atomic renumber from an ordered id list ----------
-- Accepts an array of product UUIDs in the desired display order.
-- Assigns sort_order = 10, 20, 30, … so future single-item moves have
-- room without renumbering neighbours. Ignores IDs not in the input.
create or replace function public.reorder_store_products(_ordered_ids uuid[])
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _i integer;
begin
  if not (public.has_role('system_admin') or public.has_role('finance_officer')) then
    raise exception 'Not authorised.';
  end if;

  if _ordered_ids is null or array_length(_ordered_ids, 1) is null then
    return;
  end if;

  for _i in 1 .. array_length(_ordered_ids, 1) loop
    update public.store_products
       set sort_order = _i * 10
     where id = _ordered_ids[_i];
  end loop;
end;
$$;
grant execute on function public.reorder_store_products(uuid[]) to authenticated;
