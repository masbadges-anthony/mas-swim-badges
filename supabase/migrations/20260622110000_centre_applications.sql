-- ============================================================================
-- Migration: 20260622110000_centre_applications
-- Phase:     4 — self-service intake
-- Purpose:   Let a prospective centre apply for itself instead of an admin
--            hand-inserting the row. An applicant may create exactly one shape
--            of record: their OWN, PENDING, not-yet-recognised centre.
--
--            They still cannot UPDATE it — recognition stays an admin-only
--            transition, so there's no self-recognition path — and they can
--            already read their own row via the baseline principal select
--            policy from migration 0002.
--
--            Permissive policies are OR'd, so this ADDS an applicant path
--            alongside partner_centers_insert_admin without loosening it.
-- ============================================================================

create policy "partner_centers_insert_applicant"
  on public.partner_centers
  for insert
  to authenticated
  with check (
    (select auth.uid()) = principal_profile_id
    and status = 'pending'
    and recognized_at is null
  );
