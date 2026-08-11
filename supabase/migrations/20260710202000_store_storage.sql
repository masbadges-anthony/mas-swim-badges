-- 20260710202000_store_storage.sql  (REWORK: bucket pre-exists)
--
-- Store module (S1, 3 of 3). The `store-products` bucket already exists
-- (public=true), so this migration only ensures the object policies:
-- public read, sysadmin-only write. Idempotent - safe to re-run.

insert into storage.buckets (id, name, public)
values ('store-products', 'store-products', true)
on conflict (id) do nothing;

drop policy if exists store_products_img_read   on storage.objects;
drop policy if exists store_products_img_insert on storage.objects;
drop policy if exists store_products_img_update on storage.objects;
drop policy if exists store_products_img_delete on storage.objects;

create policy store_products_img_read on storage.objects
  for select
  using (bucket_id = 'store-products');

create policy store_products_img_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-products' and public.has_role('system_admin'));

create policy store_products_img_update on storage.objects
  for update to authenticated
  using (bucket_id = 'store-products' and public.has_role('system_admin'))
  with check (bucket_id = 'store-products' and public.has_role('system_admin'));

create policy store_products_img_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-products' and public.has_role('system_admin'));
