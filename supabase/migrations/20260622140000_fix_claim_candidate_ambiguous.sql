-- ============================================================================
-- Migration: 20260622140000_fix_claim_candidate_ambiguous
-- Phase:     3 — hotfix
-- Purpose:   claim_candidate() declared an OUT column `full_name` (via RETURNS
--            TABLE) and also selected the unqualified column `full_name` from
--            candidates, so Postgres raised "column reference full_name is
--            ambiguous". Qualify the column references with a table alias.
--            Logic is otherwise identical to migration 0013.
-- ============================================================================

create or replace function public.claim_candidate(_code text)
returns table (candidate_id uuid, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_name    text;
  v_claimed uuid;
begin
  select c.id, c.full_name, c.claimed_by_profile_id
    into v_id, v_name, v_claimed
  from public.candidates c
  where c.claim_code = upper(trim(_code))
    and c.status = 'active'
  limit 1;

  if v_id is null then
    raise exception 'No active record matches that code.' using errcode = 'P0002';
  end if;

  if v_claimed is not null and v_claimed <> (select auth.uid()) then
    raise exception 'This child has already been claimed by another account.'
      using errcode = 'P0001';
  end if;

  update public.candidates
     set claimed_by_profile_id = (select auth.uid())
   where id = v_id;

  return query select v_id, v_name;
end;
$$;

grant execute on function public.claim_candidate(text) to authenticated;
