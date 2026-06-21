-- ============================================================================
-- Migration: 20260622090000_list_examiners
-- Phase:     3 — admin tooling
-- Purpose:   Governance needs to pick an examiner BY NAME when scheduling an
--            assessment. `profiles` is own-row-read only, and while `memberships`
--            is governance-readable, joining the two to surface examiner names
--            isn't possible from the client without broadly exposing profiles.
--
--            This SECURITY DEFINER function returns the active examiner register
--            to governance callers only — same pattern as verify_certificate()
--            and can_assess_candidate(). Non-governance callers get zero rows.
-- ============================================================================

create or replace function public.list_examiners()
returns table (
  profile_id uuid,
  full_name  text,
  email      text,
  state      public.my_state,
  expires_at date
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, m.state, m.expires_at
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where m.role   = 'examiner'
    and m.status = 'active'
    and (m.expires_at is null or m.expires_at >= current_date)
    and (
      public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('chief_examiner')
    );
$$;

comment on function public.list_examiners() is
  'Governance-only: active examiner register (id, name, email, state) for assignment pickers. Returns no rows to non-governance callers.';

grant execute on function public.list_examiners() to authenticated;
