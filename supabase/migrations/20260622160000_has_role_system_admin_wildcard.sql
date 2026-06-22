-- 20260622160000_has_role_system_admin_wildcard.sql
--
-- Redefines has_role() so an active system_admin passes EVERY role check.
-- has_role() is the spine of all ~25 RLS policies. The original logic is kept
-- VERBATIM as the second EXISTS; a system_admin wildcard is OR'd in front.
--
-- The function is LANGUAGE sql (pure SQL), so the wildcard is expressed as an
-- OR'd exists(...) — NOT a procedural IF (which is a plpgsql-only construct and
-- would be a syntax error here). Same signature → every policy inherits this
-- with zero policy rewrites.
--
-- The wildcard ignores _center_id (a system_admin passes regardless of centre
-- scope) and matches m.role::text so it is robust to enum commit ordering.
--
-- Boundary: this grants every *role* check, not trigger bypass. The certificate
-- immutability trigger still blocks UPDATE/DELETE for everyone, system_admin
-- included. True superuser power stays at the platform/SQL layer.
--
-- Prereq: 20260622150000 (adds the 'system_admin' enum value) committed first.

create or replace function public.has_role(_role membership_role, _center_id uuid default null::uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select
    -- system_admin short-circuit: passes every role check, any scope
    exists (
      select 1
      from public.memberships m
      where m.profile_id = (select auth.uid())
        and m.role::text = 'system_admin'
        and m.status     = 'active'
        and (m.expires_at is null or m.expires_at >= current_date)
    )
    or exists (
      -- original has_role() logic, unchanged
      select 1
      from public.memberships m
      where m.profile_id = (select auth.uid())
        and m.role       = _role
        and m.status     = 'active'
        and (m.expires_at is null or m.expires_at >= current_date)
        and (_center_id is null or m.partner_center_id = _center_id)
    );
$function$;
