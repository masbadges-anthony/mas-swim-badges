-- #13 unit 1a — session lifecycle + finance_officer enum labels.
-- ADD VALUE isolated (cannot share a txn with code using the new value).
-- (closed/archived already existed pre-#13; awaiting_payment/open_for_pickup/claimed are new.)
alter type public.session_status add value if not exists 'awaiting_payment';
alter type public.session_status add value if not exists 'open_for_pickup';
alter type public.session_status add value if not exists 'claimed';
alter type public.membership_role add value if not exists 'finance_officer';
