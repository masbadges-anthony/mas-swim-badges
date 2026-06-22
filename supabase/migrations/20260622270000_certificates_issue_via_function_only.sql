-- 20260622270000_certificates_issue_via_function_only.sql
--
-- Enforce "official on payment". After this, certificates can ONLY be created by
-- issue_certificates_for_session() — a SECURITY DEFINER function that runs as the
-- table owner (bypassing RLS) and is gated on the session invoice being PAID.
--
-- We drop every direct INSERT policy on certificates (the examiner self-stamp
-- path and any governance direct-insert). The per-row issuance screen is retired
-- in the same change. The no-update / no-delete immutability triggers are left
-- intact, and SELECT policies (verification/registry) are untouched.
--
-- Revoke -> reissue still works: revoking frees the pass (its certificate_id is
-- nulled), then re-running the bulk issuer for that already-paid session mints a
-- fresh certificate for the freed pass.
--
-- Name-agnostic and idempotent: drops INSERT policies (polcmd = 'a') by lookup.

do $$
declare r record;
begin
  for r in
    select polname
    from pg_policy
    where polrelid = 'public.certificates'::regclass
      and polcmd = 'a'   -- 'a' = INSERT
  loop
    execute format('drop policy %I on public.certificates', r.polname);
  end loop;
end $$;
