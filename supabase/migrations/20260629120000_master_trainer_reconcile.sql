-- 20260629120000_master_trainer_reconcile.sql
-- Master Trainer reconciliation (Part B) — records the full enum/role reconciliation idempotently.
--
-- Context: OD-2 establishes a single unified `master_trainer` role that absorbs the legacy
-- `instructor_trainer` and `examiner_trainer` streams. Part A (ALTER TYPE ... ADD VALUE) and the
-- test-trainer partner_center_admin revoke (#6) were already applied ad hoc and are folded in here
-- so the migration history is a complete, append-only record of the reconciliation.
--
-- This file is idempotent against the LIVE database (master_trainer already committed via Part A,
-- so ADD VALUE IF NOT EXISTS is a no-op and the dependent statements below are safe in one tx).
-- NOTE for a hypothetical fresh-DB replay: Postgres forbids using a newly added enum value in the
-- same transaction that created it. If ever replaying on a DB where master_trainer does NOT yet
-- exist, run statement (1) on its own and let it commit BEFORE running (2)–(5).

-- (1) Enum value — unified Master Trainer role (no-op on live; already added in Part A).
alter type membership_role add value if not exists 'master_trainer';

-- (2) Scope CHECK — add the master_trainer rule (national scope: no partner_center_id),
--     mirroring the existing examiner_trainer rule. Legacy clauses retained; nothing tightened.
alter table public.memberships drop constraint memberships_scope_valid;
alter table public.memberships add constraint memberships_scope_valid check (
  case role
    when 'partner_center_admin'::membership_role then (partner_center_id is not null)
    when 'examiner'::membership_role            then ((state is not null) and (partner_center_id is null))
    when 'board_member'::membership_role        then (partner_center_id is null)
    when 'coaching_panel'::membership_role      then (partner_center_id is null)
    when 'chairperson'::membership_role         then (partner_center_id is null)
    when 'chief_examiner'::membership_role      then (partner_center_id is null)
    when 'examiner_trainer'::membership_role    then (partner_center_id is null)  -- deprecated; kept for safety
    when 'master_trainer'::membership_role      then (partner_center_id is null)
    else true
  end
);

-- (3) Row migration — both legacy trainer streams collapse into the unified role.
--     Live data has one instructor_trainer row; examiner_trainer included for completeness/idempotency.
update memberships
set role = 'master_trainer'
where role::text in ('instructor_trainer', 'examiner_trainer');

-- (4) RLS policies — replace the hardcoded legacy trainer refs with master_trainer.
--     Non-trainer roles in each policy are preserved exactly. ALTER POLICY keeps cmd/applies-to intact.

-- courses: INSERT (WITH CHECK)
alter policy courses_insert on public.courses
  with check (
    has_role('master_trainer'::membership_role)
    or has_role('chairperson'::membership_role)
    or has_role('board_member'::membership_role)
  );

-- courses: SELECT/manage (USING)
alter policy courses_select_manage on public.courses
  using (
    has_role('master_trainer'::membership_role)
    or has_role('chairperson'::membership_role)
    or has_role('board_member'::membership_role)
    or has_role('chief_examiner'::membership_role)
  );

-- courses: UPDATE (USING + WITH CHECK)
alter policy courses_update on public.courses
  using (
    has_role('master_trainer'::membership_role)
    or has_role('chairperson'::membership_role)
    or has_role('board_member'::membership_role)
  )
  with check (
    has_role('master_trainer'::membership_role)
    or has_role('chairperson'::membership_role)
    or has_role('board_member'::membership_role)
  );

-- instructor_invitations: SELECT (USING)
alter policy instructor_invitations_select on public.instructor_invitations
  using (
    has_role('master_trainer'::membership_role)
    or has_role('chairperson'::membership_role)
    or has_role('board_member'::membership_role)
  );

-- (5) Verification (read-only; run after apply to confirm — should return the migrated row(s)
--     as master_trainer and no remaining legacy trainer grants):
-- select role, count(*) from memberships
-- where role::text in ('instructor_trainer','examiner_trainer','master_trainer')
-- group by role;
