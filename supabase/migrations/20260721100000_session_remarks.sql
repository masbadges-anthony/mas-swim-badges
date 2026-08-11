-- 20260721100000_session_remarks.sql
--
-- Adds two 200-char remarks fields to assessment_sessions and threads them
-- through the RPCs that touch session lifecycle. Visibility rules per the
-- master TODO:
--   instructor_remarks: written at session CREATE by the booking instructor.
--                       Visible to examiner + governance; NOT to parents.
--   examiner_remarks:   written at session PICKUP by the examiner.
--                       Visible to governance + instructor; NOT to parents.

alter table public.assessment_sessions
  add column if not exists instructor_remarks text
    check (instructor_remarks is null or char_length(instructor_remarks) <= 200),
  add column if not exists examiner_remarks text
    check (examiner_remarks is null or char_length(examiner_remarks) <= 200);

-- ---------- Extend create_session_with_roster to accept instructor_remarks ----------
-- Wrapper approach: a lightweight setter the frontend calls immediately after
-- create_session_with_roster returns. Keeps the original RPC signature stable
-- (which is important if other flows call it) while adding the remarks path.
create or replace function public.set_session_instructor_remarks(
  _session_id uuid,
  _remarks    text
)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _sess public.assessment_sessions%rowtype;
begin
  select * into _sess from public.assessment_sessions where id = _session_id;
  if not found then raise exception 'Session not found.'; end if;

  -- Only the booking instructor may write instructor_remarks. Sysadmin also
  -- permitted for correction cases.
  if _sess.requested_by <> auth.uid() and not public.has_role('system_admin') then
    raise exception 'Only the booking instructor may set instructor remarks.';
  end if;

  if _remarks is not null and char_length(_remarks) > 200 then
    raise exception 'Instructor remarks must be 200 characters or fewer.';
  end if;

  update public.assessment_sessions
     set instructor_remarks = nullif(trim(coalesce(_remarks, '')), ''),
         updated_at = now()
   where id = _session_id;
end;
$$;
grant execute on function public.set_session_instructor_remarks(uuid, text) to authenticated;

-- ---------- Examiner remarks at pickup ----------
create or replace function public.set_session_examiner_remarks(
  _session_id uuid,
  _remarks    text
)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _sess public.assessment_sessions%rowtype;
begin
  select * into _sess from public.assessment_sessions where id = _session_id;
  if not found then raise exception 'Session not found.'; end if;

  -- Only the assigned examiner may write examiner_remarks. Sysadmin permitted
  -- for correction. Chief examiner + chairperson may read but not write here.
  if _sess.examiner_id is distinct from auth.uid() and not public.has_role('system_admin') then
    raise exception 'Only the assigned examiner may set examiner remarks.';
  end if;

  if _remarks is not null and char_length(_remarks) > 200 then
    raise exception 'Examiner remarks must be 200 characters or fewer.';
  end if;

  update public.assessment_sessions
     set examiner_remarks = nullif(trim(coalesce(_remarks, '')), ''),
         updated_at = now()
   where id = _session_id;
end;
$$;
grant execute on function public.set_session_examiner_remarks(uuid, text) to authenticated;

-- ---------- Parent-visibility privacy check ----------
-- Ensures neither remarks column leaks through list_session_tracker or any
-- parent-facing read. The rule: parent-facing RPCs must select only the
-- columns they need — never SELECT *.
-- Nothing to enforce structurally here; documented as a review-gate for any
-- future parent-facing session RPC (grep for tables named session_tracker,
-- list_swimmer_tracker, parent_dashboard_* — none of these may add
-- instructor_remarks/examiner_remarks to their return payload).
