-- 20260629130000_master_trainer_functions.sql
-- Master Trainer reconciliation (Part B, cont.) — rewrite the four SECURITY DEFINER /
-- routing functions that hardcode the legacy `instructor_trainer` role.
--
-- Companion to 20260629120000_master_trainer_reconcile.sql. After the row migration, any function
-- still naming `instructor_trainer` in a has_role() check would silently deny Master Trainers; and
-- enquiry_role_for would route instructor-registration enquiries to a role that matches nobody.
-- OD-2: master_trainer owns the instructor roster, so it is the correct target throughout.
--
-- Each function is reproduced verbatim from pg_get_functiondef — signature, volatility,
-- SECURITY DEFINER, and `SET search_path TO ''` preserved — with ONLY the role name changed.
-- The `system_admin` else-branch in enquiry_role_for is intentionally left untouched (unrelated
-- to this reconciliation; the label is valid since the function compiles).

-- (1) Routing: instructor_registration enquiries now route to master_trainer.
create or replace function public.enquiry_role_for(_cat enquiry_category)
 returns membership_role
 language sql
 immutable
 set search_path to ''
as $function$
  select case _cat
    when 'centre_partnership'      then 'chairperson'::public.membership_role
    when 'instructor_registration' then 'master_trainer'::public.membership_role
    else 'system_admin'::public.membership_role
  end;
$function$;

-- (2) Invite: auth check now recognizes master_trainer.
create or replace function public.invite_instructor(_email text, _full_name text, _center_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  _caller uuid := (select auth.uid());
  _target uuid;
begin
  if not (public.has_role('master_trainer')
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

-- (3) List: visibility check now recognizes master_trainer.
create or replace function public.list_instructor_invitations()
 returns table(id uuid, email text, full_name text, partner_center_id uuid, centre_name text, status text, created_at timestamp with time zone, redeemed_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select i.id, i.email, i.full_name, i.partner_center_id, pc.name,
         i.status, i.created_at, i.redeemed_at
  from public.instructor_invitations i
  left join public.partner_centers pc on pc.id = i.partner_center_id
  where public.has_role('master_trainer')
     or public.has_role('chairperson')
     or public.has_role('board_member')
  order by i.created_at desc;
$function$;

-- (4) Revoke: auth check now recognizes master_trainer.
create or replace function public.revoke_instructor_invitation(_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not (public.has_role('master_trainer')
       or public.has_role('chairperson')
       or public.has_role('board_member')) then
    raise exception 'not authorized';
  end if;
  update public.instructor_invitations
    set status = 'revoked'
    where id = _id and status = 'pending';
end;
$function$;
