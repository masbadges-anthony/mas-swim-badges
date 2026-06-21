-- ============================================================================
-- Migration: 20260621140000_issuance
-- Phase:     2 — Issuance
-- Purpose:   Close the loop between a passing assessment and a certificate.
--            1. Auto-generate certificate serials.
--            2. A certificate CANNOT exist without a passing result behind it
--               (enforced by trigger), and issuing one links it to that result.
--            3. Revoking a certificate frees its result so a replacement can be
--               reissued (the revoke-and-reissue flow).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Serial generation
--    Format: MAS-<year>-<12 random hex>. The random tail keeps serials
--    non-enumerable, which matters because verify_certificate() is keyed on it.
--    Wired as the column DEFAULT so issuance need not supply a serial; the
--    UNIQUE constraint on certificates.serial catches the astronomically rare
--    collision (insert fails, caller retries).
-- ----------------------------------------------------------------------------
create or replace function public.generate_certificate_serial()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'MAS-' || to_char(current_date, 'YYYY') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

comment on function public.generate_certificate_serial() is
  'Default generator for certificates.serial. MAS-<year>-<12 hex>; non-enumerable.';

alter table public.certificates
  alter column serial set default public.generate_certificate_serial();


-- ----------------------------------------------------------------------------
-- 2. No certificate without a pass.
--    AFTER INSERT on certificates: find an eligible passing result for this
--    candidate + level that is not yet tied to a certificate. If none, abort.
--    Otherwise link it (result.certificate_id = the new cert). The link + the
--    unique constraint on assessment_results.certificate_id together guarantee
--    one valid certificate per pass.
--
--    Why AFTER (not BEFORE): the link is an FK update pointing at the new cert,
--    which must already exist. Raising here still rolls back the insert.
-- ----------------------------------------------------------------------------
create or replace function public.link_certificate_to_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_id uuid;
begin
  select r.id
    into v_result_id
    from public.assessment_results r
   where r.candidate_id   = new.candidate_id
     and r.target_level   = new.level
     and r.outcome        = 'pass'
     and r.certificate_id is null
   order by r.assessed_on nulls last
   limit 1
   for update;

  if v_result_id is null then
    raise exception
      'cannot issue certificate: no eligible passing result for candidate % at level %',
      new.candidate_id, new.level
      using errcode = 'check_violation';
  end if;

  update public.assessment_results
     set certificate_id = new.id
   where id = v_result_id;

  return null;  -- return value ignored for AFTER triggers
end;
$$;

comment on function public.link_certificate_to_result() is
  'Gate: a certificate may only be issued against an un-certified passing result, which it then links to.';

create trigger certificates_require_pass
  after insert on public.certificates
  for each row execute function public.link_certificate_to_result();


-- ----------------------------------------------------------------------------
-- 3. Revoke-and-reissue support.
--    AFTER INSERT on certificate_revocations: unlink the revoked certificate
--    from its result (certificate_id -> null), so the pass becomes eligible
--    again and a corrected certificate can be reissued against it.
--
--    Flow is therefore enforced as: revoke first, then reissue. (Issuing before
--    revoking finds no eligible pass and is correctly rejected.)
--    History is preserved by the revocation row itself + replaced_by_certificate_id.
-- ----------------------------------------------------------------------------
create or replace function public.free_result_on_revocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_results
     set certificate_id = null
   where certificate_id = new.certificate_id;
  return null;
end;
$$;

comment on function public.free_result_on_revocation() is
  'On revocation, releases the result link so a corrected certificate can be reissued against the same pass.';

create trigger revocation_frees_result
  after insert on public.certificate_revocations
  for each row execute function public.free_result_on_revocation();


-- ----------------------------------------------------------------------------
-- Note on existing certificate INSERT policies (migration 0006):
--   The looser "examiner self-stamp" insert path is now backstopped by the
--   pass-gate trigger above — an examiner can only successfully insert a cert
--   when a real passing result exists. No policy change needed; the data
--   invariant now does the scoping the policy alone couldn't.
-- ----------------------------------------------------------------------------
