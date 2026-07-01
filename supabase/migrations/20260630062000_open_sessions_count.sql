-- #15 unit 3 — count of open-for-pickup sessions for the examiner's nav badge.
-- Reuses list_open_sessions() so the count always matches the list exactly
-- (state filter, COI exclusion, payment gate, 7-day widen all inherited).
create or replace function public.count_open_sessions()
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select count(*)::int from public.list_open_sessions();
$fn$;

grant execute on function public.count_open_sessions() to authenticated;
