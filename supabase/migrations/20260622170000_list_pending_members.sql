-- 20260622170000_list_pending_members.sql
--
-- list_pending_members(): governance-scoped, SECURITY DEFINER function returning
-- every account that has signed up (has a profile) but holds NO active role yet —
-- the "pending assignment" list for the Memberships screen.
--
-- profiles is own-row-read-only under RLS, so this must be a definer function
-- (same pattern as list_memberships). The governance gate is identical to
-- list_memberships: chairperson / board_member / chief_examiner. system_admin
-- passes it automatically via the has_role() wildcard.

create or replace function public.list_pending_members()
returns table (
  profile_id  uuid,
  full_name   text,
  email       text,
  created_at  timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select p.id, p.full_name, p.email, p.created_at
  from public.profiles p
  where (public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('chief_examiner'))
    and not exists (
      select 1
      from public.memberships m
      where m.profile_id = p.id
        and m.status = 'active'
        and (m.expires_at is null or m.expires_at >= current_date)
    )
  order by p.created_at desc;
$function$;
