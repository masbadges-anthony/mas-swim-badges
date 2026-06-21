-- ============================================================================
-- Migration: 20260621103000_partner_centers_policies_directory
-- Phase:     1 — Registry + public directory
-- Purpose:   Now that has_role() exists, layer the real management policies onto
--            partner_centers, and stand up the anonymous public directory.
--
--            These ADD to the baseline policy from migration 0002 (principal
--            reads own); permissive policies are OR'd, so nothing is loosened.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- partner_centers — role-based policies
-- ----------------------------------------------------------------------------

-- A center admin (partner_center_admin membership scoped to THIS center) reads it.
--   `id` here is the partner_centers row's id, passed as has_role's _center_id.
create policy "partner_centers_select_center_admin"
  on public.partner_centers
  for select
  to authenticated
  using ( public.has_role('partner_center_admin', id) );

-- Program leadership reads every center (Chairperson runs recognition;
-- Chief Examiner audits; Board oversees).
create policy "partner_centers_select_governance"
  on public.partner_centers
  for select
  to authenticated
  using (
    public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- Chairperson / Board create center records. (Self-service applications by the
-- applicant themselves are Phase 4 — deliberately not opened here.)
create policy "partner_centers_insert_admin"
  on public.partner_centers
  for insert
  to authenticated
  with check ( public.has_role('chairperson') or public.has_role('board_member') );

-- Chairperson / Board update centers: recognition transitions, suspension, etc.
-- Principals/center admins are read-only in Phase 1 — letting them update their
-- own row would risk self-recognition (RLS can't gate which columns change).
-- Contact-detail self-editing is part of Phase 4 self-service.
create policy "partner_centers_update_admin"
  on public.partner_centers
  for update
  to authenticated
  using      ( public.has_role('chairperson') or public.has_role('board_member') )
  with check ( public.has_role('chairperson') or public.has_role('board_member') );

-- No DELETE policy by design: a center is never hard-deleted. Removal is the
-- `removed` status, which preserves the registry record and audit history.


-- ----------------------------------------------------------------------------
-- Public directory view
--
--   The single public, anonymous-readable surface for partner centers.
--   - Shows ONLY `recognized` centers (suspended/pending/removed never appear).
--   - Curated columns only: business contact info, no person data, no status.
--   - Intentionally a *non-invoker* (definer) view: it runs as its owner and so
--     bypasses the locked partner_centers RLS, exposing exactly this projection
--     and nothing else. The base table stays unreadable by `anon`, so the view
--     is the only way the public can see center data.
--
--   NOTE: Supabase's linter flags definer views as "security definer view".
--   That warning is expected and acceptable HERE — bypassing base-table RLS to
--   publish a curated subset is the whole point of this view. Do not convert it
--   to security_invoker without also adding an anon RLS policy + column grants
--   on the base table, which would be more surface area, not less.
-- ----------------------------------------------------------------------------
create view public.partner_center_directory as
  select
    pc.id,
    pc.name,
    pc.state,
    pc.contact_email,
    pc.contact_phone,
    pc.address,
    pc.recognized_at
  from public.partner_centers pc
  where pc.status = 'recognized';

comment on view public.partner_center_directory is
  'PUBLIC projection of recognized partner centers only. Curated columns; no person data, no status. Definer view by design — the single anonymous-readable surface.';

grant select on public.partner_center_directory to anon, authenticated;
