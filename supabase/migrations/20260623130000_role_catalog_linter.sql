-- 20260623130000_role_catalog_linter.sql
--
-- (1) role_catalog — system-admin-EDITABLE documentation for each role:
--     summary, responsibilities, who-invites-whom, notes. This is the human
--     source of truth. It does NOT grant or change any access — real privileges
--     live in RLS policies + has_role(). The read-only "what this role can
--     actually do" map lives in the frontend, kept in sync with the policies.
--
-- (2) lint_memberships() — advisory warnings (never hard blocks) over ACTIVE
--     memberships, flagging assignments that look wrong: power concentration,
--     examiner+instructor, examiner+centre-admin (COI), admin-also-operational.
--
-- Both are gated: catalog edit = system_admin; linter read = governance/admin.

create table public.role_catalog (
  role             public.membership_role primary key,
  display_name     text not null,
  summary          text,
  responsibilities text,
  who_invites      text,
  notes            text,
  sort_order       int not null default 100,
  updated_by_profile_id uuid references public.profiles(id),
  updated_at       timestamptz not null default now()
);
alter table public.role_catalog enable row level security;
-- Access via definer functions only.

insert into public.role_catalog (role, display_name, summary, responsibilities, who_invites, sort_order) values
 ('chairperson','Chairperson','Top governance authority and decision-maker.','Approves partner-centre applications, sets final billing, oversees programme governance.','Created/invited during system setup by the System Administrator.',10),
 ('board_member','Board member','Governance committee member.','Shares governance oversight: centres, memberships, assessment oversight.','Invited by the System Administrator.',20),
 ('chief_examiner','Chief Examiner','Owns the examiner programme.','Maintains the examiner registry, invites examiners and issues examiner UIDs, oversees assessments.','Invited by the System Administrator.',30),
 ('examiner_trainer','Examiner Course Trainer','Trains and certifies examiners.','Runs examiner courses; schedules and manages certification courses.','Invited by the System Administrator.',40),
 ('instructor_trainer','Instructor Trainer','Trains and certifies instructors.','Reviews instructor enquiries, verifies instructor IDs, invites instructors; manages courses and ID issuance.','Invited by the System Administrator.',50),
 ('coaching_panel','Coaching Panel','Advisory technical panel.','Advisory input on syllabus and standards; governance reads.','Invited by the System Administrator.',60),
 ('examiner','Examiner','Conducts independent assessments.','Receives assessment invitations, conducts assessments, grades, issues certificates. Never assesses own-registered candidates.','Invited by the Chief Examiner; examiner UID issued at invitation.',70),
 ('instructor','Instructor','MAS Badges-certified instructor.','Registers candidates, schedules assessments, registers/represents an appointed centre, prints claim slips, views own invoices.','Invited by the Instructor Trainer after verification.',80),
 ('partner_center_admin','Centre Administrator','Administers a recognised centre.','Manages their centre''s details and staff, views centre invoices. Scoped to a single centre.','Invited by the Chairperson after centre approval and payment.',90),
 ('system_admin','System Administrator','Technical administrator.','Full administrative access; accounts/invoicing; instructor & course administration. Kept non-operational by policy.','Created during system setup.',100)
on conflict (role) do nothing;

-- Read the catalog (system admin only — this is internal documentation).
create or replace function public.get_role_catalog()
returns setof public.role_catalog
language sql stable security definer set search_path to ''
as $$
  select * from public.role_catalog
  where public.has_role('system_admin')
  order by sort_order;
$$;
grant execute on function public.get_role_catalog() to authenticated;

-- Edit the catalog (system admin only). Cannot create/rename roles — only docs.
create or replace function public.upsert_role_catalog(
  _role public.membership_role,
  _summary text default null,
  _responsibilities text default null,
  _who_invites text default null,
  _notes text default null,
  _sort_order int default null
) returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if not public.has_role('system_admin') then
    raise exception 'Only the System Administrator can edit the role catalog.';
  end if;
  update public.role_catalog
     set summary = coalesce(_summary, summary),
         responsibilities = coalesce(_responsibilities, responsibilities),
         who_invites = coalesce(_who_invites, who_invites),
         notes = coalesce(_notes, notes),
         sort_order = coalesce(_sort_order, sort_order),
         updated_by_profile_id = auth.uid(),
         updated_at = now()
   where role = _role;
end;
$$;
grant execute on function public.upsert_role_catalog(public.membership_role, text, text, text, text, int) to authenticated;

-- Advisory linter over active memberships. Warnings, never blocks.
create or replace function public.lint_memberships()
returns table (profile_id uuid, person text, code text, message text)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not (public.has_role('system_admin') or public.has_role('chairperson') or public.has_role('board_member')) then
    return;
  end if;

  return query
  with active as (
    select m.profile_id, array_agg(distinct m.role::text) as roles
    from public.memberships m
    where m.status = 'active' and (m.expires_at is null or m.expires_at >= current_date)
    group by m.profile_id
  ),
  people as (
    select a.profile_id, a.roles,
           coalesce(p.full_name, p.email, a.profile_id::text) as person
    from active a left join public.profiles p on p.id = a.profile_id
  )
  select pp.profile_id, pp.person, 'power_concentration',
         'Holds multiple leadership roles (' ||
         array_to_string(array(select r from unnest(pp.roles) r
           where r in ('chairperson','chief_examiner','board_member','system_admin')), ', ') ||
         ') — consider separation of duties.'
  from people pp
  where (select count(*) from unnest(pp.roles) r
         where r in ('chairperson','chief_examiner','board_member','system_admin')) >= 2

  union all
  select pp.profile_id, pp.person, 'examiner_instructor',
         'Is both an examiner and an instructor — ensure they never assess their own candidates.'
  from people pp where 'examiner' = any(pp.roles) and 'instructor' = any(pp.roles)

  union all
  select pp.profile_id, pp.person, 'examiner_centre_admin',
         'Is both an examiner and a centre administrator — conflict of interest for that centre''s assessments.'
  from people pp where 'examiner' = any(pp.roles) and 'partner_center_admin' = any(pp.roles)

  union all
  select pp.profile_id, pp.person, 'admin_operational',
         'System administrator also holds an operational role — keep the admin account non-operational.'
  from people pp where 'system_admin' = any(pp.roles)
    and exists (select 1 from unnest(pp.roles) r where r in ('instructor','examiner','partner_center_admin'));
end;
$$;
grant execute on function public.lint_memberships() to authenticated;
