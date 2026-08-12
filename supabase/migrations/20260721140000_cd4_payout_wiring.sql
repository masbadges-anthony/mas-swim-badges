-- 20260721140000_cd4_payout_wiring.sql
--
-- Wires the CD-4 payout schedule into session-level payout computations,
-- replacing the app_settings-driven base+travel model that returned 0.
--
-- Overview:
--   Old: expected_examiner_payout = examiner_base_per_candidate * candidates
--                                   + examiner_travel_default
--        (app_settings keys were never populated — always returned 0)
--
--   New: expected_examiner_payout = sum over booked candidates of the
--                                   examiner_rm component of their booked
--                                   level's band, per CD-4 payout_schedule
--
-- Also adds three companion functions so any staff view can pull the full
-- CD-4 breakdown for a session:
--   expected_instructor_payout(session)
--   expected_hosting_payout(session)
--   expected_mas_retention(session)
-- All four together produce the total assessment revenue split for a session.
--
-- Governance: Manual Appendix D CD-4, seeded in public.payout_schedule.

-- ============ Reader guard ============
-- Old function was sysadmin-only. Broaden read access to any governance-level
-- role so the Chairperson, Board members, Chief Examiner, and Finance Officer
-- can see expected payouts. Parents/instructors/candidates cannot read.
--
-- Not opening to booking instructors or examiners — they see the invoice
-- number and paid status, not the split.

create or replace function public.expected_examiner_payout(_session_id uuid)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_total numeric(10,2);
begin
  if not (public.has_role('system_admin')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')
       or public.has_role('finance_officer')) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(ps.examiner_rm), 0)
    into v_total
    from public.assessment_results ar
    join public.payout_schedule ps
      on ps.level_band = public.badge_level_to_band(ar.target_level)
   where ar.session_id = _session_id
     and ar.billing_stage = 'booked';

  return v_total;
end;
$function$;

grant execute on function public.expected_examiner_payout(uuid) to authenticated;

-- ============ Instructor payout ============
create or replace function public.expected_instructor_payout(_session_id uuid)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_total numeric(10,2);
begin
  if not (public.has_role('system_admin')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')
       or public.has_role('finance_officer')) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(ps.instructor_rm), 0)
    into v_total
    from public.assessment_results ar
    join public.payout_schedule ps
      on ps.level_band = public.badge_level_to_band(ar.target_level)
   where ar.session_id = _session_id
     and ar.billing_stage = 'booked';

  return v_total;
end;
$function$;

grant execute on function public.expected_instructor_payout(uuid) to authenticated;

-- ============ Hosting payout ============
create or replace function public.expected_hosting_payout(_session_id uuid)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_total numeric(10,2);
begin
  if not (public.has_role('system_admin')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')
       or public.has_role('finance_officer')) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(ps.hosting_rm), 0)
    into v_total
    from public.assessment_results ar
    join public.payout_schedule ps
      on ps.level_band = public.badge_level_to_band(ar.target_level)
   where ar.session_id = _session_id
     and ar.billing_stage = 'booked';

  return v_total;
end;
$function$;

grant execute on function public.expected_hosting_payout(uuid) to authenticated;

-- ============ MAS retention ============
create or replace function public.expected_mas_retention(_session_id uuid)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_total numeric(10,2);
begin
  if not (public.has_role('system_admin')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')
       or public.has_role('finance_officer')) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(ps.mas_retention_rm), 0)
    into v_total
    from public.assessment_results ar
    join public.payout_schedule ps
      on ps.level_band = public.badge_level_to_band(ar.target_level)
   where ar.session_id = _session_id
     and ar.billing_stage = 'booked';

  return v_total;
end;
$function$;

grant execute on function public.expected_mas_retention(uuid) to authenticated;

-- ============ Aggregate breakdown ============
-- Single-call helper that returns all four components + total for a session.
-- Frontends showing a "session payout summary" call this once rather than
-- four times.
create or replace function public.session_payout_breakdown(_session_id uuid)
returns table (
  examiner_rm      numeric,
  instructor_rm    numeric,
  hosting_rm       numeric,
  mas_retention_rm numeric,
  total_rm         numeric,
  candidate_count  integer
)
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if not (public.has_role('system_admin')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')
       or public.has_role('finance_officer')) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    coalesce(sum(ps.examiner_rm),      0)::numeric as examiner_rm,
    coalesce(sum(ps.instructor_rm),    0)::numeric as instructor_rm,
    coalesce(sum(ps.hosting_rm),       0)::numeric as hosting_rm,
    coalesce(sum(ps.mas_retention_rm), 0)::numeric as mas_retention_rm,
    coalesce(sum(ps.total_rm),         0)::numeric as total_rm,
    count(distinct ar.candidate_id)::integer      as candidate_count
    from public.assessment_results ar
    join public.payout_schedule ps
      on ps.level_band = public.badge_level_to_band(ar.target_level)
   where ar.session_id = _session_id
     and ar.billing_stage = 'booked';
end;
$function$;

grant execute on function public.session_payout_breakdown(uuid) to authenticated;
