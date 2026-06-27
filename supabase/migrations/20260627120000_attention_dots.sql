-- 20260627120000_attention_dots.sql
--
-- Sidebar "attention dot" support for six more menu items, reusing the exact
-- pattern already shipped for Enquiries (count_unhandled_enquiries): each item
-- gets a SECURITY DEFINER count RPC returning a scalar integer, the portal
-- re-fetches it on every navigation, and <AttentionDot> shows a dot when > 0.
--
-- The Enquiries dot clears because acknowledging an enquiry changes its status.
-- Several of the items below cannot clear that way (viewing your invitations
-- does not respond to them; viewing your child's badges does not change the
-- certificate). So this migration adds ONE tiny, shared per-user "last seen"
-- marker and defines every count as:
--
--     items needing attention that arrived AFTER the caller last viewed the page
--
-- "Auto-clear on view" is then uniform: the page calls mark_attention_seen() on
-- mount, so on the next navigation the count is 0 and the dot disappears. A new
-- item (created after that view) re-triggers the dot. This is the same shape as
-- Enquiries — a count source + re-fetch on navigation — just with a per-user
-- watermark so "viewed" actually clears it.
--
-- SAFETY:
--   * Every per-user count filters strictly by (select auth.uid()) INSIDE the
--     function — a per-user dot can never leak another user's count.
--   * Scalar (integer) returns — no RETURNS TABLE / ambiguous-column collisions.
--   * Every table is aliased and every reference is schema-qualified;
--     search_path is pinned to '' on every function.

-- ---------------------------------------------------------------------------
-- Shared per-user "last seen" watermark.
-- ---------------------------------------------------------------------------
create table if not exists public.attention_seen (
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  topic      text        not null,
  seen_at    timestamptz not null default now(),
  primary key (profile_id, topic)
);

alter table public.attention_seen enable row level security;
-- Intentionally NO permissive policies: the only access paths are the definer
-- functions below, each of which is scoped to (select auth.uid()).

-- Record that the caller has just viewed a given topic's page (upsert to now()).
create or replace function public.mark_attention_seen(_topic text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;

  insert into public.attention_seen (profile_id, topic, seen_at)
  values (v_uid, _topic, now())
  on conflict (profile_id, topic)
    do update set seen_at = now();
end;
$$;

grant execute on function public.mark_attention_seen(text) to authenticated;

-- The caller's last-seen timestamp for a topic (epoch if never viewed).
-- Internal helper; SECURITY DEFINER so the count functions can read the marker
-- without a table policy. Always scoped to (select auth.uid()).
create or replace function public.attention_last_seen(_topic text)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (select s.seen_at
       from public.attention_seen s
      where s.profile_id = (select auth.uid())
        and s.topic = _topic),
    'epoch'::timestamptz
  );
$$;

grant execute on function public.attention_last_seen(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Centre applications — GLOBAL (admins who can review). Pending/unreviewed
--    partner-centre applications submitted since this admin last looked.
-- ---------------------------------------------------------------------------
create or replace function public.count_pending_centre_applications()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.partner_applications a
  where (public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('system_admin'))
    and a.status in ('submitted', 'pending')
    and a.created_at > public.attention_last_seen('centre_applications');
$$;

grant execute on function public.count_pending_centre_applications() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Instructor onboarding — GLOBAL. Pending instructor invitations awaiting
--    review since this admin last looked.
-- ---------------------------------------------------------------------------
create or replace function public.count_pending_instructor_onboarding()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.instructor_invitations i
  where (public.has_role('instructor_trainer')
      or public.has_role('chairperson')
      or public.has_role('board_member'))
    and i.status = 'pending'
    and i.created_at > public.attention_last_seen('instructor_onboarding');
$$;

grant execute on function public.count_pending_instructor_onboarding() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Invitations — PER-USER (signed-in examiner only). Open, unresponded
--    examiner invitations addressed to THIS examiner. Strictly scoped to
--    (select auth.uid()); never a global count.
-- ---------------------------------------------------------------------------
create or replace function public.count_my_open_invitations()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.session_invitations si
  where si.examiner_profile_id = (select auth.uid())
    and si.status = 'invited'
    and si.invited_at > public.attention_last_seen('invitations');
$$;

grant execute on function public.count_my_open_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Grading — PER-USER (signed-in examiner only). Roster rows assigned to
--    THIS examiner still awaiting an outcome (outcome is null). Strictly scoped
--    to (select auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.count_my_grading_queue()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.assessment_results r
  where r.assessor_profile_id = (select auth.uid())
    and r.outcome is null
    and r.created_at > public.attention_last_seen('grading');
$$;

grant execute on function public.count_my_grading_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Claim slips — PER-USER. Unclaimed candidates THIS user registered, i.e.
--    parent claim slips still to be handed out. Strictly scoped to
--    (select auth.uid()) via registered_by_profile_id.
-- ---------------------------------------------------------------------------
create or replace function public.count_my_unclaimed_slips()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.candidates c
  where c.registered_by_profile_id = (select auth.uid())
    and c.status = 'active'
    and c.claimed_by_profile_id is null
    and c.created_at > public.attention_last_seen('claim_slips');
$$;

grant execute on function public.count_my_unclaimed_slips() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) My child's badges — PER-USER (signed-in parent only). Certificates issued
--    to candidates THIS parent has claimed, that have appeared since they last
--    viewed the page. Strictly scoped to (select auth.uid()) via
--    claimed_by_profile_id.
-- ---------------------------------------------------------------------------
create or replace function public.count_my_new_child_badges()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::int
  from public.certificates cert
  join public.candidates c on c.id = cert.candidate_id
  where c.claimed_by_profile_id = (select auth.uid())
    and cert.created_at > public.attention_last_seen('child_badges');
$$;

grant execute on function public.count_my_new_child_badges() to authenticated;
