-- 20260622200000_examiner_invitation_functions.sql
--
-- The examiner-invitation flow. Staff invite one or more COI-eligible examiners;
-- the first to accept becomes the session's examiner, which assigns them across
-- the roster. The COI trigger (enforce_assessment_coi) is the hard backstop:
-- assigning an assessor who instructs any rostered candidate raises and rolls
-- back the whole accept, so a conflicted examiner can never take a session.
--
-- Governance gate matches list_memberships: chairperson / board_member /
-- chief_examiner (system_admin passes via the has_role wildcard).
--
-- Prereq: session_status values 'examiner_invited' and 'scheduled' (migration 18)
-- and the session_invitations table (migration 19) must be committed first.

----------------------------------------------------------------------
-- 1) list_eligible_examiners(session): active examiners with NO COI for
--    this session's roster. Powers the staff invite picker.
----------------------------------------------------------------------
create or replace function public.list_eligible_examiners(_session_id uuid)
returns table (profile_id uuid, full_name text, email text, state my_state)
language sql
stable security definer
set search_path to ''
as $function$
  select p.id, p.full_name, p.email, m.state
  from public.memberships m
  join public.profiles p on p.id = m.profile_id
  where (public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('chief_examiner'))
    and m.role   = 'examiner'
    and m.status = 'active'
    and (m.expires_at is null or m.expires_at >= current_date)
    and not exists (
      -- exclude examiners who instruct any candidate rostered in this session
      select 1
      from public.assessment_results r
      join public.candidates c on c.id = r.candidate_id
      where r.session_id = _session_id
        and c.registered_by_profile_id = p.id
    )
  order by p.full_name;
$function$;

----------------------------------------------------------------------
-- 2) invite_examiner(session, examiner): staff create/refresh an invitation.
--    Validates active-examiner status and no COI before inviting, and advances
--    the session to 'examiner_invited' if still 'requested'.
----------------------------------------------------------------------
create or replace function public.invite_examiner(_session_id uuid, _examiner_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invitation_id uuid;
  v_is_examiner   boolean;
  v_has_coi       boolean;
begin
  if not (public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select exists (
    select 1 from public.memberships m
    where m.profile_id = _examiner_profile_id
      and m.role   = 'examiner'
      and m.status = 'active'
      and (m.expires_at is null or m.expires_at >= current_date)
  ) into v_is_examiner;
  if not v_is_examiner then
    raise exception 'profile % is not an active examiner', _examiner_profile_id
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1
    from public.assessment_results r
    join public.candidates c on c.id = r.candidate_id
    where r.session_id = _session_id
      and c.registered_by_profile_id = _examiner_profile_id
  ) into v_has_coi;
  if v_has_coi then
    raise exception 'conflict of interest: examiner % instructs a candidate in session %',
      _examiner_profile_id, _session_id using errcode = 'check_violation';
  end if;

  insert into public.session_invitations
    (session_id, examiner_profile_id, status, invited_by_profile_id)
  values
    (_session_id, _examiner_profile_id, 'invited', (select auth.uid()))
  on conflict (session_id, examiner_profile_id) do update
    set status = 'invited',
        invited_at = now(),
        responded_at = null,
        invited_by_profile_id = (select auth.uid())
  returning id into v_invitation_id;

  update public.assessment_sessions
     set status = 'examiner_invited'
   where id = _session_id and status = 'requested';

  return v_invitation_id;
end;
$function$;

----------------------------------------------------------------------
-- 3) list_my_invitations(): the examiner's inbox. Session summary only —
--    venue, date, state, candidate COUNT — no candidate PII before acceptance.
----------------------------------------------------------------------
create or replace function public.list_my_invitations()
returns table (
  invitation_id   uuid,
  session_id      uuid,
  status          text,
  venue           text,
  scheduled_on    date,
  state           my_state,
  candidate_count bigint,
  invited_at      timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select i.id, i.session_id, i.status,
         s.venue, s.scheduled_on, s.state,
         (select count(*) from public.assessment_results r where r.session_id = s.id),
         i.invited_at
  from public.session_invitations i
  join public.assessment_sessions s on s.id = i.session_id
  where i.examiner_profile_id = (select auth.uid())
    and i.status in ('invited','accepted')
  order by i.invited_at desc;
$function$;

----------------------------------------------------------------------
-- 4) respond_to_invitation(invitation, accept): the examiner accepts or
--    declines. On accept: marks accepted, sets the session examiner + status
--    'scheduled', assigns the examiner across the roster (COI trigger enforces),
--    and withdraws any other open invitations for the session.
----------------------------------------------------------------------
create or replace function public.respond_to_invitation(_invitation_id uuid, _accept boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session_id uuid;
  v_examiner   uuid;
begin
  select session_id, examiner_profile_id
    into v_session_id, v_examiner
    from public.session_invitations
   where id = _invitation_id;

  if v_session_id is null then
    raise exception 'invitation not found';
  end if;

  if v_examiner <> (select auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if not _accept then
    update public.session_invitations
       set status = 'declined', responded_at = now()
     where id = _invitation_id;
    return;
  end if;

  -- ACCEPT
  update public.session_invitations
     set status = 'accepted', responded_at = now()
   where id = _invitation_id;

  update public.assessment_sessions
     set examiner_profile_id = v_examiner,
         status = 'scheduled'
   where id = v_session_id;

  -- assign across the roster; enforce_assessment_coi fires per row and rolls
  -- back the whole accept if any rostered candidate is a conflict
  update public.assessment_results
     set assessor_profile_id = v_examiner
   where session_id = v_session_id;

  -- the slot is filled; withdraw any other still-open invitations
  update public.session_invitations
     set status = 'withdrawn', responded_at = now()
   where session_id = v_session_id
     and id <> _invitation_id
     and status = 'invited';
end;
$function$;
