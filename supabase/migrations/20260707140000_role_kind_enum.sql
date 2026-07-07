-- 20260707140000_role_kind_enum.sql
-- Onboarding quiz module — role dimension. Enum isolated in its own migration.
-- Guarded so it is safe whether or not the type already exists.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_kind') then
    create type public.role_kind as enum ('instructor', 'examiner');
  end if;
end
$$;
