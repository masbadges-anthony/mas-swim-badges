-- 20260710203000_store_rpcs.sql
--
-- Store module (S2): the write path + list functions. All mutations are
-- SECURITY DEFINER RPCs (tables grant reads only).
--
--   • is_store_buyer()          - examiner / instructor / partner_center_admin
--   • can_operate_store()       - finance_officer / system_admin (FO actions)
--   • submit_store_order()      - cart -> submitted; price+label snapshot;
--                                 tracked stock decremented at submit
--   • cancel_store_order()      - buyer while submitted; FO until paid;
--                                 tracked stock restored
--   • fo_invoice_store_order()  - submitted -> invoiced; amount recomputed
--                                 server-side; invoice_no = SINV- + order tail
--   • fo_mark_store_order_paid()- invoiced -> paid (payment_ref)
--   • fo_ship_store_order()     - paid -> shipped (tracking; fulfilled_at)
--   • list_my_store_orders()    - buyer history (items aggregated)
--   • list_store_orders()       - staff queue, optional status filter
--
-- EDITOR RULE: run ONE function at a time (language sql validates at
-- creation; a bad reference in a batch rolls back and hides the culprit).

-- ============ 1 · buyer/operator helpers ============
create or replace function public.is_store_buyer()
returns boolean
language sql stable security definer set search_path to ''
as $$
  select public.has_role('examiner')
      or public.has_role('instructor')
      or public.has_role('partner_center_admin');
$$;
grant execute on function public.is_store_buyer() to authenticated;

-- ============ 2 ============
create or replace function public.can_operate_store()
returns boolean
language sql stable security definer set search_path to ''
as $$
  select public.has_role('finance_officer')
      or public.has_role('system_admin');
$$;
grant execute on function public.can_operate_store() to authenticated;

-- ============ 3 · submit ============
-- _items: jsonb array of {"product_id": uuid, "qty": int}
create or replace function public.submit_store_order(
  _items          jsonb,
  _recipient_name text,
  _phone          text,
  _email          text,
  _address_line1  text,
  _address_line2  text,
  _city           text,
  _state          public.my_state,
  _postcode       text,
  _note           text default null
)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  _order_id uuid;
  _it       record;
  _p        public.store_products%rowtype;
  _total    numeric(10,2) := 0;
begin
  if not public.is_store_buyer() then
    raise exception 'Not authorised: the store is open to examiners, instructors, and partner centres.';
  end if;

  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'Order has no items.';
  end if;
  if coalesce(trim(_recipient_name), '') = '' or coalesce(trim(_phone), '') = ''
     or coalesce(trim(_email), '') = '' or coalesce(trim(_address_line1), '') = ''
     or coalesce(trim(_city), '') = '' or _state is null
     or coalesce(trim(_postcode), '') = '' then
    raise exception 'Shipping details incomplete: recipient, phone, email, address, city, state, and postcode are required.';
  end if;

  insert into public.store_orders
    (ordered_by_profile_id, status, note,
     recipient_name, phone, email, address_line1, address_line2, city, state, postcode)
  values
    (auth.uid(), 'submitted', nullif(trim(_note), ''),
     trim(_recipient_name), trim(_phone), trim(_email),
     trim(_address_line1), nullif(trim(_address_line2), ''),
     trim(_city), _state, trim(_postcode))
  returning id into _order_id;

  for _it in
    select (e->>'product_id')::uuid as product_id,
           (e->>'qty')::int         as qty
    from jsonb_array_elements(_items) e
  loop
    if _it.qty is null or _it.qty <= 0 then
      raise exception 'Invalid quantity.';
    end if;

    select * into _p from public.store_products
    where id = _it.product_id and active
    for update;
    if not found then
      raise exception 'Product unavailable.';
    end if;

    if _p.stock_qty is not null then
      if _p.stock_qty < _it.qty then
        raise exception 'Insufficient stock for %: % available.', _p.name, _p.stock_qty;
      end if;
      update public.store_products
         set stock_qty = stock_qty - _it.qty
       where id = _p.id;
    end if;

    insert into public.store_order_items
      (order_id, product_id, quantity, unit_price, line_total, label)
    values
      (_order_id, _p.id, _it.qty, _p.unit_price,
       round(_p.unit_price * _it.qty, 2), _p.name);

    _total := _total + round(_p.unit_price * _it.qty, 2);
  end loop;

  update public.store_orders set total_amount = _total where id = _order_id;
  return _order_id;
end;
$$;
grant execute on function public.submit_store_order(jsonb, text, text, text, text, text, text, public.my_state, text, text) to authenticated;

-- ============ 4 · cancel ============
create or replace function public.cancel_store_order(_order_id uuid, _reason text default null)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _o  public.store_orders%rowtype;
  _it record;
begin
  select * into _o from public.store_orders where id = _order_id for update;
  if not found then raise exception 'Order not found.'; end if;

  if _o.ordered_by_profile_id = auth.uid() then
    if _o.status <> 'submitted' then
      raise exception 'You can cancel only while the order is awaiting invoicing. Contact the finance office.';
    end if;
  elsif public.can_operate_store() then
    if _o.status not in ('submitted', 'invoiced') then
      raise exception 'Orders can be cancelled only before payment.';
    end if;
  else
    raise exception 'Not authorised.';
  end if;

  -- restore tracked stock
  for _it in
    select i.product_id, i.quantity
    from public.store_order_items i
    where i.order_id = _order_id
  loop
    update public.store_products
       set stock_qty = stock_qty + _it.quantity
     where id = _it.product_id and stock_qty is not null;
  end loop;

  update public.store_orders
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = nullif(trim(_reason), '')
   where id = _order_id;
end;
$$;
grant execute on function public.cancel_store_order(uuid, text) to authenticated;

-- ============ 5 · FO: invoice ============
create or replace function public.fo_invoice_store_order(_order_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _o      public.store_orders%rowtype;
  _amount numeric(10,2);
begin
  if not public.can_operate_store() then raise exception 'Not authorised.'; end if;

  select * into _o from public.store_orders where id = _order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if _o.status <> 'submitted' then
    raise exception 'Only a submitted order can be invoiced (current: %).', _o.status;
  end if;

  select coalesce(sum(line_total), 0) into _amount
  from public.store_order_items where order_id = _order_id;
  if _amount <= 0 then raise exception 'Order has no billable items.'; end if;

  update public.store_orders
     set status = 'invoiced',
         invoice_no = replace(order_no, 'ST-', 'SINV-'),
         invoice_amount = _amount,
         total_amount = _amount,
         invoiced_at = now(),
         invoiced_by = auth.uid()
   where id = _order_id;
end;
$$;
grant execute on function public.fo_invoice_store_order(uuid) to authenticated;

-- ============ 6 · FO: mark paid ============
create or replace function public.fo_mark_store_order_paid(_order_id uuid, _payment_ref text default null)
returns void
language plpgsql security definer set search_path to ''
as $$
declare _o public.store_orders%rowtype;
begin
  if not public.can_operate_store() then raise exception 'Not authorised.'; end if;

  select * into _o from public.store_orders where id = _order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if _o.status <> 'invoiced' then
    raise exception 'Only an invoiced order can be marked paid (current: %).', _o.status;
  end if;

  update public.store_orders
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         payment_ref = nullif(trim(_payment_ref), '')
   where id = _order_id;
end;
$$;
grant execute on function public.fo_mark_store_order_paid(uuid, text) to authenticated;

-- ============ 7 · FO: ship ============
create or replace function public.fo_ship_store_order(_order_id uuid, _tracking_ref text default null)
returns void
language plpgsql security definer set search_path to ''
as $$
declare _o public.store_orders%rowtype;
begin
  if not public.can_operate_store() then raise exception 'Not authorised.'; end if;

  select * into _o from public.store_orders where id = _order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if _o.status <> 'paid' then
    raise exception 'Only a paid order can be shipped (current: %).', _o.status;
  end if;

  update public.store_orders
     set status = 'shipped',
         fulfilled_at = now(),
         shipped_by = auth.uid(),
         tracking = nullif(trim(_tracking_ref), '')
   where id = _order_id;
end;
$$;
grant execute on function public.fo_ship_store_order(uuid, text) to authenticated;

-- ============ 8 · buyer list ============
-- legacy versions of the two list functions exist with different return
-- shapes (42P13) - drop all overloads by name before creating
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('list_my_store_orders', 'list_store_orders')
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create or replace function public.list_my_store_orders()
returns table (
  order_id uuid, order_no text, status public.store_order_status,
  created_at timestamptz, total_amount numeric,
  invoice_no text, invoice_amount numeric,
  paid_at timestamptz, fulfilled_at timestamptz, tracking text,
  recipient_name text, city text, state public.my_state,
  items jsonb
)
language sql stable security definer set search_path to ''
as $$
  select o.id, o.order_no, o.status, o.created_at, o.total_amount,
         o.invoice_no, o.invoice_amount,
         o.paid_at, o.fulfilled_at, o.tracking,
         o.recipient_name, o.city, o.state,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'label', i.label, 'qty', i.quantity,
                     'unit_price', i.unit_price, 'line_total', i.line_total)
                   order by i.label)
            from public.store_order_items i where i.order_id = o.id),
           '[]'::jsonb)
  from public.store_orders o
  where o.ordered_by_profile_id = auth.uid()
  order by o.created_at desc;
$$;
grant execute on function public.list_my_store_orders() to authenticated;

-- ============ 9 · staff list ============
create or replace function public.list_store_orders(_status public.store_order_status default null)
returns table (
  order_id uuid, order_no text, status public.store_order_status,
  created_at timestamptz, total_amount numeric,
  buyer_name text, buyer_email text,
  recipient_name text, phone text, email text,
  address_line1 text, address_line2 text, city text,
  state public.my_state, postcode text, note text,
  invoice_no text, invoice_amount numeric, invoiced_at timestamptz,
  paid_at timestamptz, payment_ref text,
  fulfilled_at timestamptz, tracking text,
  cancelled_at timestamptz, cancel_reason text,
  items jsonb
)
language sql stable security definer set search_path to ''
as $$
  select o.id, o.order_no, o.status, o.created_at, o.total_amount,
         coalesce(p.full_name, p.email), p.email,
         o.recipient_name, o.phone, o.email,
         o.address_line1, o.address_line2, o.city, o.state, o.postcode, o.note,
         o.invoice_no, o.invoice_amount, o.invoiced_at,
         o.paid_at, o.payment_ref,
         o.fulfilled_at, o.tracking,
         o.cancelled_at, o.cancel_reason,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'label', i.label, 'qty', i.quantity,
                     'unit_price', i.unit_price, 'line_total', i.line_total)
                   order by i.label)
            from public.store_order_items i where i.order_id = o.id),
           '[]'::jsonb)
  from public.store_orders o
  join public.profiles p on p.id = o.ordered_by_profile_id
  where public.is_store_staff()
    and (_status is null or o.status = _status)
  order by o.created_at desc;
$$;
grant execute on function public.list_store_orders(public.store_order_status) to authenticated;
