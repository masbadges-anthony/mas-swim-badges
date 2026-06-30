-- #13 unit 4 — examiner self-pickup: record_payment(+gate), list_open_sessions, claim_session.

-- #13 unit 4 — examiner self-pickup core.
-- (1) record_payment now also flips the session awaiting_payment -> open_for_pickup
--     when the booked-prepay invoice is fully paid (the gate-opening transition).
-- (2) list_open_sessions: the pickup pool — paid sessions, state-filtered, widened to
--     all states 7 days after the booked-prepay invoice was paid, COI-excluded, with
--     booker contact + paid status (never the amount).
-- (3) claim_session: examiner picks one up — payment-gated, COI-checked, state-checked.
-- COI mirrors enforce_assessment_coi exactly: an examiner who is a candidate's
-- registering instructor (candidates.registered_by_profile_id) is excluded.

-- ---------------------------------------------------------------------------------
-- (1) record_payment — definitive version: billing-role auth (unit 3) + the session
--     transition. Supersedes the unit-3 version cleanly.
-- ---------------------------------------------------------------------------------
create or replace function public.record_payment(
  _invoice_id uuid, _amount numeric, _method text default null, _reference text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_session    uuid;
  v_bill_to    uuid;
  v_total      numeric;
  v_status     text;
  v_stage      text;
  v_paid_sum   numeric;
  v_new_status text;
begin
  if not (public.has_role('finance_officer') or public.has_role('system_admin')
       or public.has_role('chairperson')) then
    raise exception 'not authorized to record payments' using errcode = 'insufficient_privilege';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'amount must be positive' using errcode = 'check_violation';
  end if;

  select session_id, bill_to_profile_id, total, status, stage
    into v_session, v_bill_to, v_total, v_status, v_stage
    from public.invoices
   where id = _invoice_id;

  if v_session is null then
    raise exception 'invoice not found';
  end if;
  if v_status = 'void' then
    raise exception 'cannot record payment against a void invoice' using errcode = 'check_violation';
  end if;

  insert into public.payments
    (direction, invoice_id, session_id, payee_profile_id, amount, method, reference, recorded_by_profile_id)
  values
    ('inbound', _invoice_id, v_session, v_bill_to, _amount, _method, _reference, (select auth.uid()));

  select coalesce(sum(amount), 0)
    into v_paid_sum
    from public.payments
   where invoice_id = _invoice_id and direction = 'inbound';

  if v_paid_sum >= v_total then
    v_new_status := 'paid';
    update public.invoices set status = 'paid', paid_at = now() where id = _invoice_id;

    -- GATE: when the booked-prepay invoice clears, open the session to the examiner pool.
    if v_stage = 'booked_prepay' then
      update public.assessment_sessions
         set status = 'open_for_pickup'
       where id = v_session and status = 'awaiting_payment';
    end if;
  else
    v_new_status := 'issued';
    update public.invoices set status = 'issued' where id = _invoice_id and status = 'pro_forma';
  end if;

  return jsonb_build_object(
    'invoice_id', _invoice_id,
    'paid_to_date', v_paid_sum,
    'invoice_total', v_total,
    'status', v_new_status,
    'fully_paid', (v_paid_sum >= v_total));
end;
$fn$;

-- ---------------------------------------------------------------------------------
-- (2) list_open_sessions — the examiner's pickup pool.
-- ---------------------------------------------------------------------------------
create or replace function public.list_open_sessions()
 returns table(
   session_id      uuid,
   venue           text,
   state           public.my_state,
   scheduled_on    date,
   candidate_count bigint,
   open_to_all     boolean,
   booker_name     text,
   booker_phone    text,
   booker_email    text,
   centre_name     text,
   paid            boolean
 )
 language plpgsql
 stable security definer
 set search_path to ''
as $fn$
declare
  v_me    uuid := (select auth.uid());
  v_state public.my_state;
begin
  if not public.has_role('examiner') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  -- the examiner's covered state
  select m.state into v_state
    from public.memberships m
   where m.profile_id = v_me and m.role = 'examiner' and m.status = 'active'
     and (m.expires_at is null or m.expires_at >= current_date)
   limit 1;

  return query
  with paid_open as (
    -- sessions waiting for an examiner, with the booked-prepay paid timestamp
    select s.id, s.venue, s.state, s.scheduled_on, s.requested_by_profile_id, s.partner_center_id,
           inv.paid_at
    from public.assessment_sessions s
    join public.invoices inv
      on inv.session_id = s.id and inv.stage = 'booked_prepay' and inv.status = 'paid'
    where s.status = 'open_for_pickup'
      and s.examiner_profile_id is null
  )
  select
    po.id, po.venue, po.state, po.scheduled_on,
    (select count(*) from public.session_enrolments e where e.session_id = po.id),
    (po.paid_at <= now() - interval '7 days')                         as open_to_all,
    pr.full_name, pr.phone, pr.email,
    pc.name,
    true                                                              as paid
  from paid_open po
  left join public.profiles       pr on pr.id = po.requested_by_profile_id
  left join public.partner_centers pc on pc.id = po.partner_center_id
  where
    -- state filter: own state, OR widened to all once 7 days elapsed since payment
    (po.state = v_state or po.paid_at <= now() - interval '7 days')
    -- COI exclusion: drop sessions rostering a candidate this examiner registers
    and not exists (
      select 1
      from public.session_enrolments e
      join public.candidates c on c.id = e.candidate_id
      where e.session_id = po.id
        and c.registered_by_profile_id = v_me
    )
  order by po.scheduled_on nulls last;
end;
$fn$;

grant execute on function public.list_open_sessions() to authenticated;

-- ---------------------------------------------------------------------------------
-- (3) claim_session — examiner picks up an open session.
-- ---------------------------------------------------------------------------------
create or replace function public.claim_session(_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_me       uuid := (select auth.uid());
  v_status   public.session_status;
  v_existing uuid;
  v_state    public.my_state;
  v_my_state public.my_state;
  v_paid_at  timestamptz;
begin
  if not public.has_role('examiner') then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select status, examiner_profile_id, state
    into v_status, v_existing, v_state
    from public.assessment_sessions
   where id = _session_id
   for update;   -- lock the row: first claim wins

  if v_status is null then
    raise exception 'session not found';
  end if;
  if v_existing is not null then
    raise exception 'session already claimed' using errcode = 'check_violation';
  end if;

  -- payment gate
  if v_status <> 'open_for_pickup' then
    raise exception 'session payment not cleared' using errcode = 'check_violation';
  end if;

  select inv.paid_at into v_paid_at
    from public.invoices inv
   where inv.session_id = _session_id and inv.stage = 'booked_prepay' and inv.status = 'paid'
   limit 1;

  -- state eligibility: own state, or any examiner once 7 days have elapsed since payment
  select m.state into v_my_state
    from public.memberships m
   where m.profile_id = v_me and m.role = 'examiner' and m.status = 'active'
     and (m.expires_at is null or m.expires_at >= current_date)
   limit 1;

  if not (v_state = v_my_state or (v_paid_at is not null and v_paid_at <= now() - interval '7 days')) then
    raise exception 'session is outside your state and not yet open to all'
      using errcode = 'check_violation';
  end if;

  -- COI: cannot claim a session rostering a candidate you register
  if exists (
    select 1
    from public.session_enrolments e
    join public.candidates c on c.id = e.candidate_id
    where e.session_id = _session_id and c.registered_by_profile_id = v_me
  ) then
    raise exception 'conflict of interest: you instruct a candidate on this roster'
      using errcode = 'check_violation';
  end if;

  -- assign + schedule + stamp assessor on the roster (so grading + the COI trigger run)
  update public.assessment_sessions
     set examiner_profile_id = v_me, status = 'claimed'
   where id = _session_id;

  update public.assessment_results
     set assessor_profile_id = v_me
   where session_id = _session_id;

  return jsonb_build_object('session_id', _session_id, 'status', 'claimed');
end;
$fn$;

grant execute on function public.claim_session(uuid) to authenticated;
