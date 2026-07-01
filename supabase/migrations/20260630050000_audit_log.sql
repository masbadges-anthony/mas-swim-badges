-- #14 unit 5 — audit log for money events + the audited reopen override.
-- Scope (decision #8): payment/refund actions + post-close lifecycle overrides.
-- Money events are captured by a trigger on payments (no function redefinition).

-- ---------------------------------------------------------------------------------
-- (1) audit_log table
-- ---------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles(id),
  action            text not null,           -- payment_recorded | refund_recorded | session_reopened | ...
  object_type       text not null,           -- payment | session
  object_id         uuid,
  session_id        uuid,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists audit_log_session_idx on public.audit_log(session_id);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
for select using (public.has_role('system_admin') or public.has_role('chairperson'));

drop policy if exists audit_log_no_direct_write on public.audit_log;
create policy audit_log_no_direct_write on public.audit_log
for all using (false) with check (false);

-- ---------------------------------------------------------------------------------
-- (2) payments -> audit trigger. Every payment / refund row is logged.
-- ---------------------------------------------------------------------------------
create or replace function public.audit_payment_row()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_action text;
begin
  v_action := case
    when new.direction = 'inbound' then 'payment_recorded'
    when new.direction = 'payout' and new.note = 'refund' then 'refund_recorded'
    else 'payout_recorded'
  end;

  insert into public.audit_log (actor_profile_id, action, object_type, object_id, session_id, detail)
  values (
    new.recorded_by_profile_id, v_action, 'payment', new.id, new.session_id,
    jsonb_build_object(
      'amount', new.amount, 'direction', new.direction, 'method', new.method,
      'reference', new.reference, 'invoice_id', new.invoice_id, 'note', new.note)
  );
  return new;
end;
$fn$;

drop trigger if exists trg_audit_payment on public.payments;
create trigger trg_audit_payment
  after insert on public.payments
  for each row execute function public.audit_payment_row();

-- ---------------------------------------------------------------------------------
-- (3) reopen_session — the audited override to auto-close. closed -> completed.
-- ---------------------------------------------------------------------------------
create or replace function public.reopen_session(_session_id uuid, _reason text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $fn$
declare
  v_status public.session_status;
begin
  if not (public.has_role('finance_officer') or public.has_role('system_admin')
       or public.has_role('chairperson')) then
    raise exception 'not authorized to reopen sessions' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(trim(_reason), '')) < 3 then
    raise exception 'a reason is required to reopen a session' using errcode = 'check_violation';
  end if;

  select status into v_status from public.assessment_sessions where id = _session_id for update;
  if v_status is null then
    raise exception 'session not found';
  end if;
  if v_status <> 'closed' then
    raise exception 'only a closed session can be reopened (status %)', v_status using errcode = 'check_violation';
  end if;

  update public.assessment_sessions set status = 'completed' where id = _session_id;

  insert into public.audit_log (actor_profile_id, action, object_type, object_id, session_id, detail)
  values ((select auth.uid()), 'session_reopened', 'session', _session_id, _session_id,
          jsonb_build_object('reason', trim(_reason), 'from', 'closed', 'to', 'completed'));
end;
$fn$;

grant execute on function public.reopen_session(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------
-- (4) list_audit_log — governance read, optional session filter.
-- ---------------------------------------------------------------------------------
create or replace function public.list_audit_log(_session_id uuid default null, _limit int default 200)
 returns table(
   id uuid, actor_name text, action text, object_type text,
   object_id uuid, session_id uuid, venue text, detail jsonb, created_at timestamptz
 )
 language sql stable security definer set search_path to ''
as $fn$
  select a.id, pr.full_name, a.action, a.object_type, a.object_id, a.session_id,
         s.venue, a.detail, a.created_at
  from public.audit_log a
  left join public.profiles pr on pr.id = a.actor_profile_id
  left join public.assessment_sessions s on s.id = a.session_id
  where (public.has_role('system_admin') or public.has_role('chairperson'))
    and (_session_id is null or a.session_id = _session_id)
  order by a.created_at desc
  limit _limit;
$fn$;

grant execute on function public.list_audit_log(uuid, int) to authenticated;
