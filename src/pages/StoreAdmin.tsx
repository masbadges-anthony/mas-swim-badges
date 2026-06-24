import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Order {
  id: string; buyer: string | null; centre: string | null; status: string;
  total_amount: number; paid_amount: number; shipping_address: string | null;
  tracking: string | null; created_at: string;
}
interface Product {
  id: string; code: string; name: string; description: string | null;
  category: string | null; unit_price: number; active: boolean; sort_order: number;
}

const STAT: Record<string, { label: string; cls: string }> = {
  placed:    { label: 'Awaiting payment', cls: 'is-warning' },
  paid:      { label: 'Paid · to ship', cls: 'is-info' },
  fulfilled: { label: 'Shipped', cls: 'is-success' },
  cancelled: { label: 'Cancelled', cls: '' },
};
const FILTERS = ['placed', 'paid', 'fulfilled'] as const;

export default function StoreAdmin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>('placed');
  const [pay, setPay] = useState<Record<string, { method: string; amount: string; reference: string; proof: string }>>({});
  const [track, setTrack] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [np, setNp] = useState({ code: '', name: '', category: '', price: '' });

  const load = useCallback(async () => {
    const [o, p] = await Promise.all([
      supabase.rpc('list_store_orders', { _status: filter }),
      supabase.rpc('list_store_products', { _include_inactive: true }),
    ]);
    setOrders((o.data ?? []) as Order[]);
    setProducts((p.data ?? []) as Product[]);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function recordPayment(id: string) {
    const p = pay[id] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
    if (!p.amount) { alert('Enter amount.'); return; }
    setBusy(id);
    await supabase.rpc('record_store_payment', {
      _order: id, _method: p.method, _amount: Number(p.amount),
      _reference: p.reference || null, _proof_url: p.proof || null,
    });
    setBusy(null); load();
  }
  async function markPaid(id: string) {
    setBusy(id);
    const { error } = await supabase.rpc('mark_store_order_paid', { _order: id });
    setBusy(null);
    if (error) { alert(error.message); return; }
    load();
  }
  async function fulfil(id: string) {
    setBusy(id);
    await supabase.rpc('fulfil_store_order', { _order: id, _tracking: track[id] || null });
    setBusy(null); load();
  }
  async function cancel(id: string) {
    setBusy(id);
    await supabase.rpc('cancel_store_order', { _order: id });
    setBusy(null); load();
  }
  async function addProduct() {
    if (!np.code || !np.name) { alert('Code and name required.'); return; }
    await supabase.rpc('upsert_store_product', {
      _code: np.code, _name: np.name, _category: np.category || null,
      _unit_price: Number(np.price || 0), _active: true,
    });
    setNp({ code: '', name: '', category: '', price: '' });
    load();
  }
  async function toggleProduct(p: Product) {
    await supabase.rpc('upsert_store_product', {
      _code: p.code, _name: p.name, _category: p.category, _unit_price: p.unit_price,
      _description: p.description, _active: !p.active, _sort_order: p.sort_order,
    });
    load();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Store · admin</p>
        <h1>Store orders</h1>
        <p className="mas-lede">Record payments, mark orders paid, and ship. Manage the catalogue below.</p>
      </header>

      <div className="mas-segmented" style={{ marginBottom: '1.25rem' }}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
            {STAT[f].label}
          </button>
        ))}
      </div>

      {orders.length === 0 && <p className="mas-status">No orders in this state.</p>}
      {orders.map((o) => {
        const p = pay[o.id] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
        return (
          <div key={o.id} className="mas-form" style={{ marginBottom: '0.9rem' }}>
            <div className="mas-form-cardhead">
              <div>
                <span className={`mas-badge ${STAT[o.status]?.cls ?? ''}`}>{STAT[o.status]?.label ?? o.status}</span>
                <h2 style={{ marginTop: '0.5rem' }}>{o.buyer ?? '—'}{o.centre ? ` · ${o.centre}` : ''}</h2>
              </div>
              <span className="mas-field-opt">RM {Number(o.total_amount).toFixed(2)}</span>
            </div>
            {o.shipping_address && <p className="mas-field-note" style={{ marginTop: 0 }}>Ship to: {o.shipping_address}</p>}
            <p className="mas-field-note">Recorded payments: RM {Number(o.paid_amount ?? 0).toFixed(2)} of RM {Number(o.total_amount).toFixed(2)}</p>

            {o.status === 'placed' && (
              <>
                <div className="mas-form-grid" style={{ marginTop: '0.5rem' }}>
                  <div className="mas-field">
                    <label className="mas-field-label">Method</label>
                    <select className="mas-select" value={p.method} onChange={(e) => setPay((pp) => ({ ...pp, [o.id]: { ...p, method: e.target.value } }))}>
                      <option value="transfer">Bank transfer</option>
                      <option value="qr">QR pay</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Amount (RM)</label>
                    <input className="mas-input" type="number" value={p.amount} onChange={(e) => setPay((pp) => ({ ...pp, [o.id]: { ...p, amount: e.target.value } }))} />
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Reference <span className="mas-field-opt">(optional)</span></label>
                    <input className="mas-input" value={p.reference} onChange={(e) => setPay((pp) => ({ ...pp, [o.id]: { ...p, reference: e.target.value } }))} />
                  </div>
                  <div className="mas-field">
                    <label className="mas-field-label">Proof URL <span className="mas-field-opt">(optional)</span></label>
                    <input className="mas-input" value={p.proof} onChange={(e) => setPay((pp) => ({ ...pp, [o.id]: { ...p, proof: e.target.value } }))} />
                  </div>
                </div>
                <div className="mas-form-actions" style={{ marginTop: '0.75rem', gap: '0.6rem' }}>
                  <button className="mas-btn-ghost" disabled={busy === o.id} onClick={() => recordPayment(o.id)}>Record payment</button>
                  <button className="mas-btn-success" disabled={busy === o.id} onClick={() => markPaid(o.id)}>Mark paid</button>
                  <button className="mas-btn-danger" disabled={busy === o.id} onClick={() => cancel(o.id)}>Cancel</button>
                </div>
              </>
            )}

            {o.status === 'paid' && (
              <div style={{ marginTop: '0.5rem' }}>
                <input className="mas-input" placeholder="Tracking / dispatch note (optional)" value={track[o.id] ?? ''}
                  onChange={(e) => setTrack((t) => ({ ...t, [o.id]: e.target.value }))} style={{ marginBottom: '0.6rem' }} />
                <div className="mas-form-actions" style={{ gap: '0.6rem' }}>
                  <button className="mas-btn-success" disabled={busy === o.id} onClick={() => fulfil(o.id)}>Mark shipped</button>
                  <button className="mas-btn-danger" disabled={busy === o.id} onClick={() => cancel(o.id)}>Cancel</button>
                </div>
              </div>
            )}

            {o.status === 'fulfilled' && o.tracking && <p className="mas-status mas-status-good">Shipped · {o.tracking}</p>}
          </div>
        );
      })}

      <header className="mas-page-head mas-section-head"><h2>Catalogue</h2></header>
      <div className="mas-form">
        <div className="mas-form-cardhead"><div><p className="mas-eyebrow">Add / update</p><h2>Product</h2></div></div>
        <div className="mas-form-grid">
          <div className="mas-field"><label className="mas-field-label">Code</label>
            <input className="mas-input" value={np.code} onChange={(e) => setNp({ ...np, code: e.target.value })} placeholder="unique_code" /></div>
          <div className="mas-field"><label className="mas-field-label">Name</label>
            <input className="mas-input" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} /></div>
          <div className="mas-field"><label className="mas-field-label">Category</label>
            <input className="mas-input" value={np.category} onChange={(e) => setNp({ ...np, category: e.target.value })} placeholder="Promotion / Teaching" /></div>
          <div className="mas-field"><label className="mas-field-label">Unit price (RM)</label>
            <input className="mas-input" type="number" value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })} /></div>
        </div>
        <div className="mas-form-actions" style={{ marginTop: '0.75rem' }}>
          <button className="mas-btn-primary" onClick={addProduct}>Save product</button>
        </div>
      </div>

      <ul className="mas-admin-list">
        {products.map((p) => (
          <li key={p.id} className="mas-admin-row">
            <div className="mas-admin-main">
              <h3 className="mas-admin-name">{p.name} <span className="mas-mono">{p.code}</span></h3>
              <p className="mas-admin-meta">
                <span className="mas-pill">RM {Number(p.unit_price).toFixed(2)}</span>
                <span className={`mas-badge ${p.active ? 'is-success' : ''}`}>{p.active ? 'Active' : 'Hidden'}</span>
              </p>
            </div>
            <button className="mas-btn-ghost" onClick={() => toggleProduct(p)}>{p.active ? 'Hide' : 'Show'}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
