-- 20260622180000_session_status_lifecycle_values.sql
--
-- Extends session_status with the OPERATIONAL lifecycle states for the
-- examiner-invitation flow. Existing values 'requested' (default) and
-- 'completed' (graded) are kept. Financial states (invoiced/paid/examiner_paid)
-- intentionally live on the invoice/payment objects, NOT on the session.
--
-- Lifecycle: requested -> examiner_invited -> scheduled -> completed
--            -> closed -> archived
--
-- APPEND-ONLY. ADD VALUE is idempotent here and these values are NOT used in
-- this migration, so adding them alongside is safe. They will be referenced by
-- functions in a later migration (after commit).

alter type public.session_status add value if not exists 'examiner_invited';
alter type public.session_status add value if not exists 'scheduled';
alter type public.session_status add value if not exists 'closed';
alter type public.session_status add value if not exists 'archived';
