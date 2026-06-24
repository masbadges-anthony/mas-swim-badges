import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Product {
  id: string; code: string; name: string; description: string | null;
  category: string | null; unit_price: number; currency: string;
}
interface MyOrder {
  id: string; status: string; total_amount: number; tracking: string | null;
  created_at: string; item_count: number;
}

const STAT: Record<string, { label: string; cls: string }> = {
  placed:    { label: 'Placed · awaiting payment', cls: 'is-warning' },
  paid:      { label: 'Paid · preparing', cls: 'is-info' },
  fulfilled: { label: 'Shipped', cls: 'is-success' },
  cancelled: { label: 'Cancelled', cls: '' },
};

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export default function Store() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<MyOrder[]>([]);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase.rpc('list_my_store_orders');
    setOrders((data ?? []) as MyOrder[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_store_products', { _include_inactive: false });
      setProducts((data ?? []) as Product[]);
    })();
    loadOrders();
  }, [loadOrders]);

  function setQty(id: string, qty: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, qty) }));
    setDone(false);
  }

  const lines = useMemo(
    () => products.filter((p) => (cart[p.id] ?? 0) > 0).map((p) => ({ p, qty: cart[p.id] })),
    [products, cart],
  );
  const total = useMemo(() => lines.reduce((s, l) => s + l.p.unit_price * l.qty, 0), [lines]);

  async function placeOrder() {
    if (lines.length === 0) return;
    setBusy(true); setError(null); setDone(false);
    const items = lines.map((l) => ({ product_id: l.p.id, quantity: l.qty }));
    const { error } = await supabase.rpc('place_store_order', {
      _items: items, _partner_center_id: null,
      _shipping_address: address || null, _note: note || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true); setCart({}); setAddress(''); setNote('');
    loadOrders();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Store</p>
        <h1>Branding &amp; teaching materials</h1>
        <p className="mas-lede">
          Order programme materials for your centre or classes. Place your order
          here; we’ll confirm the amount and payment details, and ship once paid.
        </p>
      </header>

      {done && (
        <div className="mas-alert is-success">
          <div className="mas-alert-body">
            <p className="mas-alert-title">Order placed</p>
            <p className="mas-alert-text">It’s listed below as “awaiting payment.” We’ll be in touch with payment details.</p>
          </div>
        </div>
      )}
      {error && <div className="mas-alert is-danger"><div className="mas-alert-body"><p className="mas-alert-text">{error}</p></div></div>}

      <div className="mas-form-grid">
        {products.map((p) => (
          <div key={p.id} className="mas-form" style={{ margin: 0 }}>
            <div className="mas-form-cardhead">
              <div>
                {p.category && <p className="mas-eyebrow">{p.category}</p>}
                <h2>{p.name}</h2>
              </div>
              <span className="mas-badge is-primary">RM {Number(p.unit_price).toFixed(2)}</span>
            </div>
            {p.description && <p className="mas-field-note" style={{ marginTop: 0 }}>{p.description}</p>}
            <div className="mas-field" style={{ marginTop: '0.6rem' }}>
              <label className="mas-field-label">Quantity</label>
              <input className="mas-input" type="number" min={0} style={{ width: '120px' }}
                value={cart[p.id] ?? 0} onChange={(e) => setQty(p.id, Number(e.target.value))} />
            </div>
          </div>
        ))}
      </div>

      <header className="mas-page-head mas-section-head"><h2>Your order</h2></header>
      {lines.length === 0 ? (
        <p className="mas-status">Add a quantity to any item above to start an order.</p>
      ) : (
        <div className="mas-form">
          <ul className="mas-admin-list" style={{ marginBottom: '1rem' }}>
            {lines.map((l) => (
              <li key={l.p.id} className="mas-admin-row">
                <div className="mas-admin-main">
                  <h3 className="mas-admin-name">{l.p.name} × {l.qty}</h3>
                  <p className="mas-admin-meta"><span className="mas-admin-sub">RM {(l.p.unit_price * l.qty).toFixed(2)}</span></p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mas-field-label">Total: RM {total.toFixed(2)}</p>
          <div className="mas-form-grid" style={{ marginTop: '0.5rem' }}>
            <div className="mas-field mas-col-2">
              <label className="mas-field-label">Delivery address</label>
              <input className="mas-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where should we ship this?" />
            </div>
            <div className="mas-field mas-col-2">
              <label className="mas-field-label">Note <span className="mas-field-opt">(optional)</span></label>
              <input className="mas-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know" />
            </div>
          </div>
          <div className="mas-form-actions" style={{ marginTop: '1rem' }}>
            <button className="mas-btn-primary" onClick={placeOrder} disabled={busy}>
              {busy ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </div>
      )}

      <header className="mas-page-head mas-section-head"><h2>Your orders</h2></header>
      {orders.length === 0 && <p className="mas-status">No orders yet.</p>}
      {orders.length > 0 && (
        <ul className="mas-admin-list">
          {orders.map((o) => (
            <li key={o.id} className="mas-admin-row">
              <div className="mas-admin-main">
                <h3 className="mas-admin-name">RM {Number(o.total_amount).toFixed(2)} · {o.item_count} item{o.item_count === 1 ? '' : 's'}</h3>
                <p className="mas-admin-meta">
                  <span className={`mas-badge ${STAT[o.status]?.cls ?? ''}`}>{STAT[o.status]?.label ?? o.status}</span>
                  <span className="mas-field-opt">{fmt(o.created_at)}</span>
                  {o.tracking && <span className="mas-admin-sub">Tracking: {o.tracking}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
