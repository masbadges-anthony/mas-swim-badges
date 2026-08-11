-- 20260710200000_store_enums.sql
--
-- Store module (S1, 1 of 3): the order-status enum, isolated in its own
-- migration per house rule (enum DDL never shares a transaction).
--
-- Lifecycle: submitted -> invoiced -> paid -> shipped
--            cancelled (buyer while submitted; FO until paid)

create type public.store_order_status as enum
  ('submitted', 'invoiced', 'paid', 'shipped', 'cancelled');
