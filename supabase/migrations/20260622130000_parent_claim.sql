-- ============================================================================
-- Migration: 20260622130000_parent_claim
-- Phase:     3 — parent/guardian claiming (governance decision: claim code)
-- Purpose:   A parent claims their child using a one-time code the centre or
--            instructor hands them in person (the centre is the real-world
--            verifier). The code is the capability — nobody ever searches for a
--            minor by name or date of birth, so children's data is never
--            exposed to enumeration.
--
--            candidates.claimed_by_profile_id already exists; this adds the
--            claim_code and a SECURITY DEFINER claim function that sets the
--            claimer to the caller on an exact code match.
-- ============================================================================

-- 1) Add the claim code, backfill existing rows, then enforce default/not-null.
alter table public.candidates
  add column if not exists claim_code text;

update public.candidates
   set claim_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
 where claim_code is null;

alter table public.candidates
  alter column claim_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

alter table public.candidates
  alter column claim_code set not null;

create unique index if not exists candidates_claim_code_key
  on public.candidates (claim_code);

comment on column public.candidates.claim_code is
  'One-time code a centre/instructor gives a verified parent to claim this child. Capability, not a secret in the cryptographic sense — keep codes out of public surfaces.';


-- 2) Claim function: exact code match, sets the caller as the guardian.
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
  select id, full_name, claimed_by_profile_id
    into v_id, v_name, v_claimed
  from public.candidates
  where claim_code = upper(trim(_code))
    and status = 'active'
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

comment on function public.claim_candidate(text) is
  'Parent claims a child by one-time code: exact match only, sets caller as guardian, idempotent for the same caller, rejects codes already claimed by someone else.';

grant execute on function public.claim_candidate(text) to authenticated;
