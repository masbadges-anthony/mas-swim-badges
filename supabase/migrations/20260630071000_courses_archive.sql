-- #16.C — courses.archived_at + set_course_archived(id, archived).
-- Per the CLAUDE.md archive mapping: courses need a NEW archived_at column
-- (they have no existing "inactive" status). Withdraws a course from the
-- listing surfaces without deleting it, preserving history.

alter table public.courses
  add column if not exists archived_at timestamptz;

create or replace function public.set_course_archived(_course_id uuid, _archived boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $fn$
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')
       or public.has_role('chief_examiner') or public.has_role('master_trainer')
       or public.has_role('system_admin')) then
    raise exception 'not authorized to archive courses' using errcode = 'insufficient_privilege';
  end if;

  update public.courses
     set archived_at = case when _archived then now() else null end
   where id = _course_id;
end;
$fn$;

grant execute on function public.set_course_archived(uuid, boolean) to authenticated;
