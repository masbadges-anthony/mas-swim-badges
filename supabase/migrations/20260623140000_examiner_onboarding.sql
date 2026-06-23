-- 20260623140000_examiner_onboarding.sql
--
-- Examiner onboarding, mirroring instructor onboarding but owned by the Chief
-- Examiner, with an auto-generated examiner UID:
--   • Chief Examiner inputs an email + state -> a pending invitation is created
--     and an examiner UID (EX-YYYY-NNNN) is generated.
--   • When that email registers, grant_examiner_on_signup grants the examiner
--     role (scoped to the invited state) and marks the invitation accepted.
--   • Chief Examiner sees the registry (pending + accepted, with UIDs) and can
--     revoke a pending invitation.
--
-- NOTE: examiner membership scope requires a state (examiner -> state, no centre),
-- so the invitation captures it. Examiners are NEVER an open call — invite-only.

create sequence if not exists public.examiner_uid_seq;

create table public.examiner_invitations (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  examiner_uid          text not null unique
                          default ('EX-' || to_char(now(), 'YYYY') || '-' ||
                                   lpad(nextval('public.examiner_uid_seq')::text, 4, '0')),
  state                 public.my_state not null,
  invited_by_profile_id uuid references public.profiles(id),
  status                text not null default 'pending'
                          check (status in ('pending', 'accepted', 'revoked')),
  accepted_profile_id   uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  accepted_at           timestamptz
);
alter table public.examiner_invitations enable row level security;
-- Access via definer functions only.

-- Grant the examiner role when an invited email registers.
create or replace function public.grant_examiner_on_signup()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare _inv record;
begin
  for _inv in
    select * from public.examiner_invitations
    where lower(email) = lower(NEW.email) and status = 'pending'
  loop
    begin
      insert into public.memberships(profile_id, role, state, status)
      values (NEW.id, 'examiner', _inv.state, 'active');
    exception when others then
      null;  -- tolerate any pre-existing membership
    end;
    update public.examiner_invitations
       set status = 'accepted', accepted_profile_id = NEW.id, accepted_at = now()
     where id = _inv.id;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists grant_examiner_on_signup on public.profiles;
create trigger grant_examiner_on_signup
  after insert on public.profiles
  for each row execute function public.grant_examiner_on_signup();

-- Chief Examiner invites an examiner; returns the generated UID.
create or replace function public.onboard_examiner(_email text, _state public.my_state)
returns text
language plpgsql security definer set search_path to ''
as $$
declare _uid text;
begin
  if not public.has_role('chief_examiner') then
    raise exception 'Only the Chief Examiner can invite examiners.';
  end if;
  if position('@' in coalesce(_email, '')) = 0 then
    raise exception 'A valid email is required.';
  end if;
  if exists (select 1 from public.examiner_invitations
             where lower(email) = lower(_email) and status = 'pending') then
    raise exception 'There is already a pending invitation for that email.';
  end if;

  insert into public.examiner_invitations(email, state, invited_by_profile_id, status)
  values (lower(trim(_email)), _state, auth.uid(), 'pending')
  returning examiner_uid into _uid;

  return _uid;
end;
$$;
grant execute on function public.onboard_examiner(text, public.my_state) to authenticated;

-- The examiner registry (pending + accepted, with UIDs).
create or replace function public.list_examiner_invitations(_include_revoked boolean default false)
returns table (
  id uuid, email text, examiner_uid text, state public.my_state,
  status text, invited_at timestamptz, accepted_at timestamptz, accepted_person text
)
language sql stable security definer set search_path to ''
as $$
  select i.id, i.email, i.examiner_uid, i.state, i.status, i.created_at, i.accepted_at,
         coalesce(p.full_name, p.email)
  from public.examiner_invitations i
  left join public.profiles p on p.id = i.accepted_profile_id
  where public.has_role('chief_examiner')
    and (_include_revoked or i.status <> 'revoked')
  order by case i.status when 'pending' then 0 when 'accepted' then 1 else 2 end, i.created_at desc;
$$;
grant execute on function public.list_examiner_invitations(boolean) to authenticated;

create or replace function public.revoke_examiner_invitation(_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not public.has_role('chief_examiner') then
    raise exception 'Only the Chief Examiner can revoke examiner invitations.';
  end if;
  update public.examiner_invitations set status = 'revoked'
   where id = _id and status = 'pending';
end;
$$;
grant execute on function public.revoke_examiner_invitation(uuid) to authenticated;
