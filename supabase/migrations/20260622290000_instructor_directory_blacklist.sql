-- 20260622290000_instructor_directory_blacklist.sql
--
-- Public instructor directory + internal blacklist.
--
--   instructor_blacklist            — internal record + reason (no public shaming)
--   instructor_directory (view)     — PUBLIC: active, non-blacklisted instructors
--                                     (name + centre + state only; no contact info)
--   blacklist_instructor(id,reason) — records + suspends their instructor memberships
--   unblacklist_instructor(id)      — lifts the record (reactivation stays a
--                                     deliberate Memberships action)
--   list_blacklisted_instructors()  — governance-readable current blacklist
--
-- Blacklist writes: chairperson OR board_member. Reads/list: governance triad.

-- Blacklist table -------------------------------------------------
create table if not exists public.instructor_blacklist (
  id                        uuid primary key default gen_random_uuid(),
  profile_id                uuid not null references public.profiles(id),
  reason                    text,
  blacklisted_by_profile_id uuid references public.profiles(id),
  created_at                timestamptz not null default now(),
  lifted_at                 timestamptz,
  lifted_by_profile_id      uuid references public.profiles(id)
);

create index if not exists instructor_blacklist_active_idx
  on public.instructor_blacklist (profile_id) where lifted_at is null;

alter table public.instructor_blacklist enable row level security;

drop policy if exists instructor_blacklist_select on public.instructor_blacklist;
create policy instructor_blacklist_select
  on public.instructor_blacklist for select
  using (
       public.has_role('chairperson')
    or public.has_role('board_member')
    or public.has_role('chief_examiner')
  );

-- Public directory view ------------------------------------------
create or replace view public.instructor_directory as
select
  p.id          as profile_id,
  p.full_name,
  m.state,
  pc.id         as partner_center_id,
  pc.name       as centre_name
from public.memberships m
join public.profiles p on p.id = m.profile_id
left join public.partner_centers pc on pc.id = m.partner_center_id
where m.role = 'instructor'
  and m.status = 'active'
  and (m.expires_at is null or m.expires_at >= current_date)
  and not exists (
    select 1 from public.instructor_blacklist b
    where b.profile_id = p.id and b.lifted_at is null
  );

grant select on public.instructor_directory to anon, authenticated;

-- Blacklist / unblacklist ----------------------------------------
create or replace function public.blacklist_instructor(_profile_id uuid, _reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.instructor_blacklist
    where profile_id = _profile_id and lifted_at is null
  ) then
    insert into public.instructor_blacklist (profile_id, reason, blacklisted_by_profile_id)
    values (_profile_id, _reason, (select auth.uid()));
  end if;

  update public.memberships
    set status = 'suspended'
    where profile_id = _profile_id and role = 'instructor' and status = 'active';
end;
$function$;

create or replace function public.unblacklist_instructor(_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not (public.has_role('chairperson') or public.has_role('board_member')) then
    raise exception 'not authorized';
  end if;

  update public.instructor_blacklist
    set lifted_at = now(), lifted_by_profile_id = (select auth.uid())
    where profile_id = _profile_id and lifted_at is null;
  -- Reactivating the membership stays a deliberate action in Memberships.
end;
$function$;

-- List currently blacklisted -------------------------------------
create or replace function public.list_blacklisted_instructors()
returns table (
  profile_id uuid,
  full_name  text,
  email      text,
  reason     text,
  created_at timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select b.profile_id, p.full_name, p.email, b.reason, b.created_at
  from public.instructor_blacklist b
  join public.profiles p on p.id = b.profile_id
  where (public.has_role('chairperson')
      or public.has_role('board_member')
      or public.has_role('chief_examiner'))
    and b.lifted_at is null
  order by b.created_at desc;
$function$;
