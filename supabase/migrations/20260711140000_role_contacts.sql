-- 20260711140000_role_contacts.sql
--
-- Role contacts — the in-portal pointer from each published alias to the
-- current role holder. Any screen or template needing "who to email for X"
-- calls resolve_role_contact(alias) instead of hardcoding. When the holder
-- changes, sysadmin re-points; every screen updates without a redeploy.
--
-- DNS mail forwarding is a separate concern (MX at Cynet or a mail provider);
-- this module records the POLICY, DNS enforces DELIVERY.
--
-- Assignments are constrained to the appropriate role:
--   enquiries + finance  → must hold finance_officer
--   safeguarding         → must hold chairperson
--
-- Read: any authenticated user (screens need the current holder's name/email).
-- Write: sysadmin only, via upsert_role_contact() (RPC enforces role match).

-- ---------- table ----------
create table public.role_contacts (
  alias        text primary key
               check (alias in ('enquiries', 'finance', 'safeguarding')),
  holder_id    uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id)
);

-- seed the three known aliases with null holder — sysadmin assigns via UI
insert into public.role_contacts (alias) values ('enquiries'), ('finance'), ('safeguarding')
on conflict (alias) do nothing;

alter table public.role_contacts enable row level security;

create policy role_contacts_read on public.role_contacts
  for select to authenticated
  using (true);

-- Direct writes disallowed; upsert_role_contact() is the only write path
-- and it enforces sysadmin + role-membership guardrails together.

-- ---------- resolver (used by screens/templates) ----------
create or replace function public.resolve_role_contact(_alias text)
returns table (
  alias      text,
  holder_id  uuid,
  full_name  text,
  email      text
)
language sql stable security definer set search_path to ''
as $$
  select rc.alias,
         rc.holder_id,
         p.full_name,
         p.email
  from public.role_contacts rc
  left join public.profiles p on p.id = rc.holder_id
  where rc.alias = _alias;
$$;
grant execute on function public.resolve_role_contact(text) to authenticated;

-- ---------- staff list for Settings dropdowns ----------
-- Returns the set of Portal users currently active in the role that owns
-- the given alias. Feeds the Settings UI's assignment dropdown.
create or replace function public.list_role_contact_candidates(_alias text)
returns table (
  profile_id uuid,
  full_name  text,
  email      text
)
language plpgsql stable security definer set search_path to ''
as $$
declare
  _role public.membership_role;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised.';
  end if;

  case _alias
    when 'enquiries', 'finance' then _role := 'finance_officer';
    when 'safeguarding'         then _role := 'chairperson';
    else raise exception 'Unknown alias: %', _alias;
  end case;

  return query
    select distinct p.id, p.full_name, p.email
    from public.profiles p
    join public.memberships m on m.profile_id = p.id
    where m.role = _role
      and m.status = 'active'
    order by p.full_name;
end;
$$;
grant execute on function public.list_role_contact_candidates(text) to authenticated;

-- ---------- assign (sysadmin only; role match enforced) ----------
create or replace function public.upsert_role_contact(
  _alias      text,
  _holder_id  uuid
)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _required public.membership_role;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorised: sysadmin only.';
  end if;

  if _alias not in ('enquiries', 'finance', 'safeguarding') then
    raise exception 'Unknown alias: %', _alias;
  end if;

  -- unassign path (holder cleared)
  if _holder_id is null then
    update public.role_contacts
       set holder_id = null,
           updated_at = now(),
           updated_by = auth.uid()
     where alias = _alias;
    return;
  end if;

  case _alias
    when 'enquiries', 'finance' then _required := 'finance_officer';
    when 'safeguarding'         then _required := 'chairperson';
  end case;

  if not exists (
    select 1 from public.memberships
    where profile_id = _holder_id
      and role = _required
      and status = 'active'
  ) then
    raise exception 'Assignee must hold an active % membership for the % alias.',
      _required, _alias;
  end if;

  update public.role_contacts
     set holder_id = _holder_id,
         updated_at = now(),
         updated_by = auth.uid()
   where alias = _alias;

  if not found then
    insert into public.role_contacts (alias, holder_id, updated_by)
    values (_alias, _holder_id, auth.uid());
  end if;
end;
$$;
grant execute on function public.upsert_role_contact(text, uuid) to authenticated;
