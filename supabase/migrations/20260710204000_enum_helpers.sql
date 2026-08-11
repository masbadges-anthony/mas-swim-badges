-- 20260710204000_enum_helpers.sql
--
-- Settings module (S3): one helper. The frontend needs the my_state enum
-- labels for dropdowns (account creation, role grants, store checkout);
-- supabase-js cannot introspect enums, so expose them.

create or replace function public.list_my_states()
returns setof public.my_state
language sql stable
as $$
  select unnest(enum_range(null::public.my_state));
$$;
grant execute on function public.list_my_states() to authenticated;
