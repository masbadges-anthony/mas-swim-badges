-- 20260627090000_unhandled_partner_applications_count.sql
--
-- Sidebar attention dot for Centre applications. Mirrors
-- count_unhandled_enquiries: a lightweight, role-scoped scalar count of the
-- partner-centre applications still in 'submitted' state (i.e. nobody has
-- picked them up yet). The dot clears as soon as an admin acknowledges an
-- application — acknowledge_partner_application transitions status from
-- 'submitted' to 'pending', taking it out of this count.
--
-- Role gate matches canPartnerApps in App.tsx exactly: chairperson or
-- board_member. system_admin is implicitly included via the has_role()
-- wildcard pattern (the system_admin role passes every has_role check).
--
-- Scalar return (integer) — no RETURNS TABLE / ambiguous-column collisions.
create or replace function public.count_unhandled_partner_applications()
returns integer
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  _n integer;
begin
  -- Only staff who can review centre applications get a count; anyone else
  -- gets 0 (the dot stays hidden for them).
  if not (public.has_role('chairperson') or public.has_role('board_member')) then
    return 0;
  end if;

  select count(*)::int
    into _n
    from public.partner_applications pa
   where pa.status = 'submitted';

  return coalesce(_n, 0);
end;
$$;

grant execute on function public.count_unhandled_partner_applications() to authenticated;
