-- #13 unit 1b — extend memberships_scope_valid to admit finance_officer (national: no centre).
-- Mirrors the live CASE-role constraint exactly, adding only the finance_officer branch.
alter table public.memberships drop constraint if exists memberships_scope_valid;
alter table public.memberships add constraint memberships_scope_valid check (
  case role
    when 'partner_center_admin'::membership_role then (partner_center_id is not null)
    when 'examiner'::membership_role then ((state is not null) and (partner_center_id is null))
    when 'board_member'::membership_role then (partner_center_id is null)
    when 'coaching_panel'::membership_role then (partner_center_id is null)
    when 'chairperson'::membership_role then (partner_center_id is null)
    when 'chief_examiner'::membership_role then (partner_center_id is null)
    when 'examiner_trainer'::membership_role then (partner_center_id is null)
    when 'master_trainer'::membership_role then (partner_center_id is null)
    when 'finance_officer'::membership_role then (partner_center_id is null)
    else true
  end
);
