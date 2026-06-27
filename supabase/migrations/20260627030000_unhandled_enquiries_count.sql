-- 20260627030000_unhandled_enquiries_count.sql
--
-- Sidebar "attention dot" support. A lightweight, role-scoped count of the
-- UNHANDLED enquiries (status = 'new') so the portal sidebar can show a small
-- attention dot on the Enquiries item.
--
-- It reuses the existing per-row visibility gate (can_handle_enquiry) so each
-- staffer only counts the enquiries routed to their role; system_admin (via the
-- has_role wildcard) sees all. An enquiry leaves this count as soon as it is
-- acknowledged / closed / archived through set_enquiry_status — i.e. the moment
-- an admin picks it up in the existing Enquiries queue, the dot clears.
--
-- Scalar return (integer) — no RETURNS TABLE / ambiguous-column collisions; the
-- single table is aliased `e` throughout.

create or replace function public.count_unhandled_enquiries()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.enquiries e
  where e.status = 'new'
    and public.can_handle_enquiry(e.category, e.assigned_role);
$$;

grant execute on function public.count_unhandled_enquiries() to authenticated;
