-- ============================================================================
-- Migration: 20260622120000_centre_self_service
-- Phase:     4 — self-service
-- Purpose:   Let a recognised centre's admin edit ONLY their centre's contact
--            details. RLS can't gate which columns an UPDATE touches, and a
--            blanket update policy on partner_centers would risk self-
--            recognition (a principal flipping their own status). So this is a
--            SECURITY DEFINER function scoped to the partner_center_admin of
--            that centre, updating contact columns only — status, recognition,
--            and principal stay untouchable from this path.
-- ============================================================================

create or replace function public.update_my_centre_contact(
  _center_id uuid,
  _email     text,
  _phone     text,
  _address   text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('partner_center_admin', _center_id) then
    raise exception 'not authorized to edit this centre'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  update public.partner_centers
     set contact_email = _email,
         contact_phone = _phone,
         address       = _address
   where id = _center_id;
end;
$$;

comment on function public.update_my_centre_contact(uuid, text, text, text) is
  'Centre-admin self-service: updates ONLY the contact columns of a centre the caller administers. Cannot change status, recognition, or principal.';

grant execute on function public.update_my_centre_contact(uuid, text, text, text) to authenticated;
