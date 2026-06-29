-- 20260629270000_tidyups_candidate_ref_and_list_roles.sql
-- #12 tidy-ups: (1) retire candidate_ref (superseded by swimmer_id), (2) filter deprecated
-- trainer roles out of the role picker.

-- (1) Retire candidate_ref. Drops column + its unique index; then the now-unused sequence.
alter table public.candidates drop column if exists candidate_ref;
drop sequence if exists candidate_ref_seq;

-- (2) Hide deprecated trainer roles from list_roles(). Body preserved; no search_path added.
create or replace function public.list_roles()
 returns table(role membership_role)
 language sql
 stable
as $function$
  select r from unnest(enum_range(null::public.membership_role)) r
  where r not in ('instructor_trainer'::public.membership_role,
                  'examiner_trainer'::public.membership_role);
$function$;
