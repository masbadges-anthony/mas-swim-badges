-- 20260622150000_add_system_admin_instructor_trainer_roles.sql
--
-- Adds two new membership roles:
--   system_admin       — durable platform/staff authority. Powers the Accounts,
--                        Settings, billing, bulk-verify and payout surfaces.
--                        Will short-circuit has_role() to TRUE for every role check.
--   instructor_trainer — authority that certifies and invites MAS BADGES
--                        instructors (Decision D6; distinct from examiner_trainer).
--
-- APPEND-ONLY. These enum values are added here ALONE and must be COMMITTED
-- before any function or policy references them. The has_role() redefinition
-- (next migration) tests them via m.role::text to dodge the same-transaction
-- enum-use restriction, so it never needs the literal in its own transaction.
-- Do NOT use these values in the same migration that adds them.

alter type public.membership_role add value if not exists 'system_admin';
alter type public.membership_role add value if not exists 'instructor_trainer';
