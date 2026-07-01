-- #18 unit 3 — Extend list_provisioned_accounts to expose auth.users.banned_until
-- so the UI can show a 'Suspended' status. Replaces unit 18.2's function.
--
-- Note: return-type of a function cannot be changed via CREATE OR REPLACE; we
-- DROP the previous signature first. Same signature (no args), so dependents
-- resolve to the new function immediately after re-create.

drop function if exists public.list_provisioned_accounts();

create or replace function public.list_provisioned_accounts()
 returns table(
   profile_id           uuid,
   email                text,
   full_name            text,
   roles                text,
   created_at           timestamptz,
   last_sign_in_at      timestamptz,
   email_confirmed_at   timestamptz,
   banned_until         timestamptz,
   status               text   -- 'active' | 'invited_pending' | 'suspended' | 'no_membership'
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  with role_agg as (
    select m.profile_id,
           string_agg(distinct m.role::text, ', ' order by m.role::text) as roles
    from public.memberships m
    where m.status = 'active'
    group by m.profile_id
  ),
  filtered as (
    select p.id as profile_id, p.email, p.full_name,
           coalesce(ra.roles, '') as roles,
           u.created_at, u.last_sign_in_at, u.email_confirmed_at,
           u.banned_until
    from public.profiles p
    left join role_agg ra on ra.profile_id = p.id
    join auth.users u on u.id = p.id
  )
  select
    f.profile_id, f.email, f.full_name, f.roles,
    f.created_at, f.last_sign_in_at, f.email_confirmed_at, f.banned_until,
    case
      when f.banned_until is not null and f.banned_until > now() then 'suspended'
      when f.roles = '' then 'no_membership'
      when f.email_confirmed_at is null then 'invited_pending'
      else 'active'
    end
  from filtered f
  where
    (public.has_role('system_admin') or public.has_role('chairperson'))
    and not exists (
      select 1 from public.candidates c
      where c.claimed_by_profile_id = f.profile_id
        and f.roles = ''
    )
  order by f.created_at desc;
$fn$;

grant execute on function public.list_provisioned_accounts() to authenticated;
