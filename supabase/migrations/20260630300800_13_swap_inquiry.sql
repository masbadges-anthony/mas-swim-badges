-- #13 unit 5b — swap_session_examiner, inquiries table + raise/resolve/list_inquiries.

-- #13 unit 5b — examiner-swap + no-show inquiry (Chief Examiner / System Admin tools).

-- ---------------------------------------------------------------------------------
-- 1. swap_session_examiner — CE/admin replaces the examiner on a session.
--    Re-runs COI (NO bypass): the replacement cannot instruct a candidate on the
--    roster, and must be an active examiner. Reassigns the session + result rows.
-- ---------------------------------------------------------------------------------
create or replace function public.swap_session_examiner(_session_id uuid, _new_examiner uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_status   public.session_status;
  v_is_examiner boolean;
begin
  if not (public.has_role('chief_examiner') or public.has_role('system_admin')) then
    raise exception 'not authorized to swap examiners' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status
    from public.assessment_sessions where id = _session_id for update;
  if v_status is null then
    raise exception 'session not found';
  end if;
  if v_status in ('completed', 'closed', 'archived', 'cancelled') then
    raise exception 'cannot swap examiner on a % session', v_status using errcode = 'check_violation';
  end if;

  -- replacement must be an active examiner
  select exists (
    select 1 from public.memberships m
    where m.profile_id = _new_examiner and m.role = 'examiner' and m.status = 'active'
      and (m.expires_at is null or m.expires_at >= current_date)
  ) into v_is_examiner;
  if not v_is_examiner then
    raise exception 'replacement is not an active examiner' using errcode = 'check_violation';
  end if;

  -- COI (no bypass): replacement cannot instruct any candidate on this roster
  if exists (
    select 1 from public.session_enrolments e
    join public.candidates c on c.id = e.candidate_id
    where e.session_id = _session_id and c.registered_by_profile_id = _new_examiner
  ) then
    raise exception 'conflict of interest: replacement instructs a candidate on this roster'
      using errcode = 'check_violation';
  end if;

  update public.assessment_sessions
     set examiner_profile_id = _new_examiner
   where id = _session_id;

  -- reassign result rows so grading + the COI trigger run against the new examiner
  update public.assessment_results
     set assessor_profile_id = _new_examiner
   where session_id = _session_id;

  return jsonb_build_object('session_id', _session_id, 'new_examiner', _new_examiner);
end;
$fn$;

grant execute on function public.swap_session_examiner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------
-- 2. inquiries — a tracked record of examiner-conduct inquiries (e.g. no-show).
-- ---------------------------------------------------------------------------------
create table if not exists public.inquiries (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.assessment_sessions(id),
  examiner_profile_id uuid references public.profiles(id),
  reason              text not null,
  status              text not null default 'open'
                        check (status in ('open', 'resolved')),
  raised_by_profile_id uuid not null references public.profiles(id),
  raised_at           timestamptz not null default now(),
  resolved_by_profile_id uuid references public.profiles(id),
  resolved_at         timestamptz,
  resolution_note     text
);

alter table public.inquiries enable row level security;

-- visible to Chief Examiner + System Admin
drop policy if exists inquiries_select on public.inquiries;
create policy inquiries_select on public.inquiries
for select using (public.has_role('chief_examiner') or public.has_role('system_admin'));

-- writes go through the functions below (definer); block direct client writes
drop policy if exists inquiries_no_direct_write on public.inquiries;
create policy inquiries_no_direct_write on public.inquiries
for all using (false) with check (false);

-- ---------------------------------------------------------------------------------
-- 3. raise_inquiry / resolve_inquiry / list_inquiries
-- ---------------------------------------------------------------------------------
create or replace function public.raise_inquiry(
  _session_id uuid, _reason text, _examiner_profile_id uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_id uuid;
  v_examiner uuid;
begin
  if not (public.has_role('chief_examiner') or public.has_role('system_admin')) then
    raise exception 'not authorized to raise inquiries' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(trim(_reason), '')) < 3 then
    raise exception 'a reason is required' using errcode = 'check_violation';
  end if;

  -- default the examiner-in-question to the session's current examiner
  v_examiner := coalesce(_examiner_profile_id,
    (select examiner_profile_id from public.assessment_sessions where id = _session_id));

  insert into public.inquiries (session_id, examiner_profile_id, reason, raised_by_profile_id)
  values (_session_id, v_examiner, trim(_reason), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$fn$;

grant execute on function public.raise_inquiry(uuid, text, uuid) to authenticated;

create or replace function public.resolve_inquiry(_inquiry_id uuid, _resolution_note text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $fn$
begin
  if not (public.has_role('chief_examiner') or public.has_role('system_admin')) then
    raise exception 'not authorized to resolve inquiries' using errcode = 'insufficient_privilege';
  end if;

  update public.inquiries
     set status = 'resolved',
         resolved_by_profile_id = (select auth.uid()),
         resolved_at = now(),
         resolution_note = _resolution_note
   where id = _inquiry_id and status = 'open';

  if not found then
    raise exception 'inquiry not found or already resolved' using errcode = 'check_violation';
  end if;
end;
$fn$;

grant execute on function public.resolve_inquiry(uuid, text) to authenticated;

create or replace function public.list_inquiries(_include_resolved boolean default false)
 returns table(
   id uuid, session_id uuid, venue text, scheduled_on date,
   examiner_name text, reason text, status text,
   raised_by_name text, raised_at timestamptz,
   resolved_by_name text, resolved_at timestamptz, resolution_note text
 )
 language sql stable security definer set search_path to ''
as $fn$
  select q.id, q.session_id, s.venue, s.scheduled_on,
         ex.full_name, q.reason, q.status,
         rb.full_name, q.raised_at,
         rs.full_name, q.resolved_at, q.resolution_note
  from public.inquiries q
  join public.assessment_sessions s on s.id = q.session_id
  left join public.profiles ex on ex.id = q.examiner_profile_id
  left join public.profiles rb on rb.id = q.raised_by_profile_id
  left join public.profiles rs on rs.id = q.resolved_by_profile_id
  where (public.has_role('chief_examiner') or public.has_role('system_admin'))
    and (_include_resolved or q.status = 'open')
  order by q.raised_at desc;
$fn$;

grant execute on function public.list_inquiries(boolean) to authenticated;
