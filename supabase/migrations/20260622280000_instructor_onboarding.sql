-- 20260622280000_instructor_onboarding.sql
--
-- Instructor onboarding by email. An instructor_trainer (or governance) invites
-- an email; if an account already exists it is granted the instructor role at
-- once, otherwise the role is granted automatically when that email signs up.
--
--   instructor_invitations           — pending/redeemed/revoked, unique per email
--   grant_instructor_on_signup()      — AFTER INSERT on profiles, exception-safe
--   invite_instructor(email,name,ctr) — records invite, grants now if account exists
--   list_instructor_invitations()     — governance/trainer-readable list
--   revoke_instructor_invitation(id)  — cancel a pending invite
--
-- Gate everywhere: instructor_trainer OR chairperson OR board_member
-- (system_admin passes via the has_role wildcard).

-- Table -----------------------------------------------------------
create table if not exists public.instructor_invitations (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  full_name             text,
  partner_center_id     uuid references public.partner_centers(id),
  status                text not null default 'pending'
                          check (status in ('pending', 'redeemed', 'revoked')),
  invited_by_profile_id uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  redeemed_at           timestamptz
);

create unique index if not exists instructor_invitations_email_key
  on public.instructor_invitations (lower(email));

alter table public.instructor_invitations enable row level security;

-- Reads for trainers/governance (writes go through the definer functions).
drop policy if exists instructor_invitations_select on public.instructor_invitations;
create policy instructor_invitations_select
  on public.instructor_invitations for select
  using (
       public.has_role('instructor_trainer')
    or public.has_role('chairperson')
    or public.has_role('board_member')
  );

-- Auto-grant on signup -------------------------------------------
create or replace function public.grant_instructor_on_signup()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  inv record;
begin
  begin
    select * into inv
    from public.instructor_invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
    limit 1;

    if found then
      insert into public.memberships (profile_id, role, status, partner_center_id)
      values (new.id, 'instructor', 'active', inv.partner_center_id)
      on conflict do nothing;

      update public.instructor_invitations
        set status = 'redeemed', redeemed_at = now()
        where id = inv.id;
    end if;
  exception when others then
    -- onboarding must never break account creation
    null;
  end;
  return new;
end;
$function$;

drop trigger if exists trg_grant_instructor_on_signup on public.profiles;
create trigger trg_grant_instructor_on_signup
  after insert on public.profiles
  for each row execute function public.grant_instructor_on_signup();

-- Invite ----------------------------------------------------------
create or replace function public.invite_instructor(
  _email text, _full_name text, _center_id uuid
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _caller uuid := (select auth.uid());
  _target uuid;
begin
  if not (public.has_role('instructor_trainer')
       or public.has_role('chairperson')
       or public.has_role('board_member')) then
    raise exception 'not authorized to invite instructors';
  end if;

  if exists (select 1 from public.instructor_invitations where lower(email) = lower(_email)) then
    update public.instructor_invitations
      set full_name             = _full_name,
          partner_center_id     = _center_id,
          invited_by_profile_id = _caller,
          status                = case when status = 'redeemed' then 'redeemed' else 'pending' end
      where lower(email) = lower(_email);
  else
    insert into public.instructor_invitations (email, full_name, partner_center_id, invited_by_profile_id, status)
    values (lower(_email), _full_name, _center_id, _caller, 'pending');
  end if;

  -- If an account already exists, grant the role now.
  select id into _target from public.profiles where lower(email) = lower(_email) limit 1;
  if _target is not null then
    insert into public.memberships (profile_id, role, status, partner_center_id)
    values (_target, 'instructor', 'active', _center_id)
    on conflict do nothing;
    update public.instructor_invitations
      set status = 'redeemed', redeemed_at = now()
      where lower(email) = lower(_email);
    return 'granted';
  end if;

  return 'invited';
end;
$function$;

-- List ------------------------------------------------------------
create or replace function public.list_instructor_invitations()
returns table (
  id                uuid,
  email             text,
  full_name         text,
  partner_center_id uuid,
  centre_name       text,
  status            text,
  created_at        timestamptz,
  redeemed_at       timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select i.id, i.email, i.full_name, i.partner_center_id, pc.name,
         i.status, i.created_at, i.redeemed_at
  from public.instructor_invitations i
  left join public.partner_centers pc on pc.id = i.partner_center_id
  where public.has_role('instructor_trainer')
     or public.has_role('chairperson')
     or public.has_role('board_member')
  order by i.created_at desc;
$function$;

-- Revoke ----------------------------------------------------------
create or replace function public.revoke_instructor_invitation(_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not (public.has_role('instructor_trainer')
       or public.has_role('chairperson')
       or public.has_role('board_member')) then
    raise exception 'not authorized';
  end if;
  update public.instructor_invitations
    set status = 'revoked'
    where id = _id and status = 'pending';
end;
$function$;
