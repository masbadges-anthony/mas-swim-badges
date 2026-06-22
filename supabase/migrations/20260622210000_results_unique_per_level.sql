-- 20260622210000_results_unique_per_level.sql
--
-- Widens assessment_results uniqueness from (session_id, candidate_id) to
-- (session_id, candidate_id, target_level), so a candidate can be assessed for
-- more than one level in a single session (the "wave" model). Required by
-- Decision D1 (bill per level assessed): the invoice is computed from the
-- roster rows, so each assessed level must be its own row.
--
-- Idempotent and self-contained. (conkey is smallint[]; we cast to int[] on
-- both sides of the comparison to avoid the smallint[] = integer[] error.)

do $$
declare
  v_conname     text;
  v_target_cols int[];
begin
  select array_agg(a.attnum::int order by a.attnum)
    into v_target_cols
    from pg_attribute a
   where a.attrelid = 'public.assessment_results'::regclass
     and a.attname in ('session_id','candidate_id');

  select c.conname
    into v_conname
    from pg_constraint c
   where c.conrelid = 'public.assessment_results'::regclass
     and c.contype = 'u'
     and (select array_agg(x::int order by x) from unnest(c.conkey) x) = v_target_cols;

  if v_conname is not null then
    execute format('alter table public.assessment_results drop constraint %I', v_conname);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.assessment_results'::regclass
       and conname = 'assessment_results_session_candidate_level_key'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_session_candidate_level_key
      unique (session_id, candidate_id, target_level);
  end if;
end $$;
