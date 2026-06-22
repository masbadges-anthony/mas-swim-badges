-- 20260622260000_instructor_booking.sql
--
-- Opens booking to instructors. All additions are PERMISSIVE (OR'd onto the
-- existing governance policies) — nothing is loosened.
--
--  1. list_instructors()  — governance-gated picker for "book on behalf of".
--  2. instructors may INSERT their own session (requested_by = self).
--  3. governance may INSERT a session with ANY requested_by (so staff-on-behalf
--     sets the instructor of record reliably, regardless of the existing
--     governance insert policy's shape).
--  4. a session's requester may SELECT it back (needed for insert().select(),
--     and a future "my sessions" view).
--  5. the session owner may INSERT result rows onto their own session (rostering).
--     The COI trigger still fires; assessor is null at booking so it passes.

-- 1 ----------------------------------------------------------------
create or replace function public.list_instructors()
returns table (profile_id uuid, full_name text, email text)
language sql
stable security definer
set search_path to ''
as $function$
  select p.id, p.full_name, p.email
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where (public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('chief_examiner'))
    and m.role   = 'instructor'
    and m.status = 'active'
    and (m.expires_at is null or m.expires_at >= current_date)
  order by p.full_name;
$function$;

-- 2 ----------------------------------------------------------------
create policy assessment_sessions_insert_instructor
  on public.assessment_sessions for insert
  with check (
    public.has_role('instructor')
    and requested_by_profile_id = (select auth.uid())
  );

-- 3 ----------------------------------------------------------------
create policy assessment_sessions_insert_governance_any
  on public.assessment_sessions for insert
  with check (
       public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- 4 ----------------------------------------------------------------
create policy assessment_sessions_select_owner
  on public.assessment_sessions for select
  using (requested_by_profile_id = (select auth.uid()));

-- 5 ----------------------------------------------------------------
create policy assessment_results_insert_session_owner
  on public.assessment_results for insert
  with check (
    exists (
      select 1 from public.assessment_sessions s
      where s.id = session_id
        and s.requested_by_profile_id = (select auth.uid())
    )
  );
