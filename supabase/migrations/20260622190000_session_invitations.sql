-- 20260622190000_session_invitations.sql
--
-- session_invitations: staff invite one or more COI-eligible examiners to a
-- session; the first to accept becomes the session's examiner. Lets staff
-- broker an examiner without the examiner self-claiming.
--
-- Governance gate matches list_memberships: chairperson / board_member /
-- chief_examiner. system_admin passes via the has_role() wildcard.
--
-- status is text + CHECK (kept simple; can promote to an enum later if desired).
-- Examiners respond via a SECURITY DEFINER function (next migration), so there
-- is deliberately NO examiner-facing UPDATE policy here — accept/decline must
-- run the side effects (assign examiner to session + roster) atomically.

create table if not exists public.session_invitations (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.assessment_sessions(id) on delete cascade,
  examiner_profile_id   uuid not null references public.profiles(id) on delete cascade,
  status                text not null default 'invited'
                          check (status in ('invited','accepted','declined','withdrawn')),
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  invited_at            timestamptz not null default now(),
  responded_at          timestamptz,
  note                  text,
  unique (session_id, examiner_profile_id)
);

create index if not exists session_invitations_session_idx
  on public.session_invitations(session_id);
create index if not exists session_invitations_examiner_idx
  on public.session_invitations(examiner_profile_id);

alter table public.session_invitations enable row level security;

-- An examiner sees their own invitations (their inbox).
create policy session_invitations_select_examiner
  on public.session_invitations for select
  using (examiner_profile_id = (select auth.uid()));

-- Governance sees all invitations.
create policy session_invitations_select_governance
  on public.session_invitations for select
  using (
       public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- Only governance/staff create invitations (they broker the examiner).
create policy session_invitations_insert_governance
  on public.session_invitations for insert
  with check (
       public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- Governance may update (e.g. withdraw an invitation). Examiner accept/decline
-- goes through a definer function, not direct client UPDATE.
create policy session_invitations_update_governance
  on public.session_invitations for update
  using (
       public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );
