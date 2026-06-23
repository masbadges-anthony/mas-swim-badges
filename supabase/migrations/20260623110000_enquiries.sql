-- 20260623110000_enquiries.sql
--
-- Public enquiry / "open call" pipeline. A single tabbed public form captures
-- four categories of first-contact, written through a SECURITY DEFINER RPC
-- (no broad anon table access), auto-routed to the responsible role, and worked
-- as a role-scoped queue inside the portal:  new -> acknowledged -> closed/archived.
--
-- Routing:
--   centre_partnership      -> chairperson (board_member may also act)
--   instructor_registration -> instructor_trainer
--   parent_swimmer, general -> system_admin
--
-- Replies happen OUTSIDE the system (Gmail). The portal captures, routes,
-- alerts (NEW badge), and records the handling. The optional email nudge is a
-- separate Database Webhook -> Edge Function (see enquiry-notify).

create type public.enquiry_category as enum
  ('centre_partnership', 'instructor_registration', 'parent_swimmer', 'general');

create type public.enquiry_status as enum
  ('new', 'acknowledged', 'closed', 'archived');

create table public.enquiries (
  id                    uuid primary key default gen_random_uuid(),
  category              public.enquiry_category not null,
  contact_name          text not null,
  contact_email         text not null,
  contact_phone         text,
  organisation          text,          -- centre / org name (centre_partnership)
  state                 text,          -- free text; informal first contact
  instructor_ref        text,          -- MAS instructor ID (instructor_registration)
  affiliated_centre     text,          -- where they currently teach (optional)
  message               text not null,
  status                public.enquiry_status not null default 'new',
  assigned_role         public.membership_role,   -- routed-to role (server-set)
  handled_by_profile_id uuid references public.profiles(id),
  handled_at            timestamptz,
  internal_note         text,
  created_at            timestamptz not null default now()
);

alter table public.enquiries enable row level security;
-- Intentionally NO permissive policies: every access path is a definer function.

-- Category -> responsible role.
create or replace function public.enquiry_role_for(_cat public.enquiry_category)
returns public.membership_role
language sql immutable
set search_path to ''
as $$
  select case _cat
    when 'centre_partnership'      then 'chairperson'::public.membership_role
    when 'instructor_registration' then 'instructor_trainer'::public.membership_role
    else 'system_admin'::public.membership_role
  end;
$$;

-- Who may see / act on a given enquiry.
create or replace function public.can_handle_enquiry(_cat public.enquiry_category, _role public.membership_role)
returns boolean
language sql stable
set search_path to ''
as $$
  select public.has_role('system_admin')
      or public.has_role(_role)
      or (_cat = 'centre_partnership'
          and (public.has_role('chairperson') or public.has_role('board_member')));
$$;

-- PUBLIC submission. Caller supplies only content; server fixes status + routing.
create or replace function public.submit_enquiry(
  _category          public.enquiry_category,
  _contact_name      text,
  _contact_email     text,
  _message           text,
  _contact_phone     text default null,
  _organisation      text default null,
  _state             text default null,
  _instructor_ref    text default null,
  _affiliated_centre text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare _id uuid;
begin
  if length(coalesce(_contact_name, '')) < 2
     or position('@' in coalesce(_contact_email, '')) = 0
     or length(coalesce(_message, '')) < 5 then
    raise exception 'Please provide your name, a valid email, and a short message.';
  end if;

  insert into public.enquiries(
    category, contact_name, contact_email, contact_phone, organisation,
    state, instructor_ref, affiliated_centre, message, status, assigned_role
  ) values (
    _category,
    trim(_contact_name),
    lower(trim(_contact_email)),
    nullif(trim(coalesce(_contact_phone, '')), ''),
    nullif(trim(coalesce(_organisation, '')), ''),
    nullif(trim(coalesce(_state, '')), ''),
    nullif(trim(coalesce(_instructor_ref, '')), ''),
    nullif(trim(coalesce(_affiliated_centre, '')), ''),
    trim(_message),
    'new',
    public.enquiry_role_for(_category)
  ) returning id into _id;

  return _id;
end;
$$;

grant execute on function public.submit_enquiry(
  public.enquiry_category, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- Role-scoped queue read.
create or replace function public.list_enquiries(_include_archived boolean default false)
returns setof public.enquiries
language sql
stable
security definer
set search_path to ''
as $$
  select e.*
  from public.enquiries e
  where public.can_handle_enquiry(e.category, e.assigned_role)
    and (_include_archived or e.status <> 'archived')
  order by
    case e.status when 'new' then 0 when 'acknowledged' then 1 when 'closed' then 2 else 3 end,
    e.created_at desc;
$$;

grant execute on function public.list_enquiries(boolean) to authenticated;

-- Advance an enquiry through its lifecycle (records who/when, optional note).
create or replace function public.set_enquiry_status(
  _id uuid, _status public.enquiry_status, _note text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare _cat public.enquiry_category; _role public.membership_role;
begin
  select category, assigned_role into _cat, _role from public.enquiries where id = _id;
  if not found then raise exception 'Enquiry not found.'; end if;

  if not public.can_handle_enquiry(_cat, _role) then
    raise exception 'Not authorised to update this enquiry.';
  end if;

  update public.enquiries
     set status = _status,
         internal_note = coalesce(nullif(trim(coalesce(_note, '')), ''), internal_note),
         handled_by_profile_id = auth.uid(),
         handled_at = now()
   where id = _id;
end;
$$;

grant execute on function public.set_enquiry_status(uuid, public.enquiry_status, text) to authenticated;
