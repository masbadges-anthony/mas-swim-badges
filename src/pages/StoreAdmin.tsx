// #16 — Store admin, dense-table conversion.
// Two independent surfaces on one page, each dense-table + tabs + (products) inline-add:
//   ORDERS  — tabs: Awaiting payment / Paid · to ship / Shipped
//            row expands for the payment/tracking form (paid/placed states)
//   CATALOGUE — tabs: Active / Hidden
//              inline-add row: code · name · category · price · +Save
// Reads/writes: unchanged wire.
//   list_store_orders(_status), list_store_products(_include_inactive)
//   record_store_payment, mark_store_order_paid, fulfil_store_order, cancel_store_order
//   upsert_store_product
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
type Load = 'loading' | 'ready' | 'error';
type OrderTab = 'placed' | 'paid' | 'fulfilled';
type ProdTab = 'active' | 'hidden';

const ORDER_TAB_LABEL: Record<OrderTab, string> = {
  placed: 'Awaiting payment',
  paid: 'Paid · to ship',
  fulfilled: 'Shipped',
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  placed: 'Awaiting payment',
  paid: 'Paid · to ship',
  fulfilled: 'Shipped',
  cancelled: 'Cancelled',
};

const CSS = `
.mas-page.mas-page-wide { max-width: none !important; width: auto !important; margin-left: 0 !important; margin-right: 0 !important; }
.mas-tight th, .mas-tight td { padding: 0.35rem 0.6rem; white-space: nowrap; vertical-align: middle; }
.mas-tight tbody tr { line-height: 1.3; }
.mas-tight td.mas-ship-cell { white-space: normal; }
.mas-tight .mas-link { color: var(--mas-navy, #1E2752); text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
.mas-tight .mas-link:hover { text-decoration: none; }
.mas-tight .mas-link + .mas-link { margin-left: 0.6rem; }
.mas-addrow td { background:#f5f8fc; }
.mas-addrow-fields { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; }
.mas-addrow-fields input[type=text], .mas-addrow-fields input[type=number] {
  font:inherit; padding:0.35rem 0.5rem; border:1px solid var(--mas-line,#e3e9f3); border-radius:6px;
}
.mas-addrow-fields input[type=text] { min-width:9rem; }
.mas-addrow-fields input.wide { min-width:13rem; }
.mas-addrow-fields input.num { min-width:6rem; }
.mas-order-detail { display:flex; gap:0.5rem; align-items:end; flex-wrap:wrap; }
.mas-order-detail label { display:flex; flex-direction:column; font-size:0.8rem; color:var(--mas-muted,#5b6472); }
.mas-order-detail input, .mas-order-detail select {
  font:inherit; padding:0.35rem 0.5rem; border:1px solid var(--mas-line,#e3e9f3); border-radius:6px;
}
`;

function money(n: unknown): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}

export default function StoreAdmin() {
  // ---------- Orders ----------
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderLoad, setOrderLoad] = useState<Load>('loading');
  const [orderTab, setOrderTab] = useState<OrderTab>('placed');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<Record<string, string>>({});
  const [pay, setPay] = useState<Record<string, { method: string; amount: string; reference: string; proof: string }>>({});
  const [track, setTrack] = useState<Record<string, string>>({});

  // ---------- Products ----------
  const [products, setProducts] = useState<Product[]>([]);
  const [prodLoad, setProdLoad] = useState<Load>('loading');
  const [prodTab, setProdTab] = useState<ProdTab>('active');
  const [np, setNp] = useState({ code: '', name: '', category: '', price: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [prodBusy, setProdBusy] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setOrderLoad('loading');
    const { data, error } = await supabase.rpc('list_store_orders', { _status: orderTab });
    if (error) { setOrderLoad('error'); return; }
    setOrders((data ?? []) as Order[]);
    setOrderLoad('ready');
  }, [orderTab]);

  const loadProducts = useCallback(async () => {
    setProdLoad('loading');
    const { data, error } = await supabase.rpc('list_store_products', { _include_inactive: true });
    if (error) { setProdLoad('error'); return; }
    setProducts((data ?? []) as Product[]);
    setProdLoad('ready');
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ---------- Order actions ----------
  function setPayField(id: string, patch: Partial<{ method: string; amount: string; reference: string; proof: string }>) {
    setPay((p) => {
      const prev = p[id] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
      return { ...p, [id]: { ...prev, ...patch } };
    });
  }

  async function recordPayment(o: Order) {
    const p = pay[o.id] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
    if (!p.amount) {
      setOrderError((m) => ({ ...m, [o.id]: 'Enter an amount.' }));
      return;
    }
    setBusy(o.id); setOrderError((m) => { const n = { ...m }; delete n[o.id]; return n; });
    const { error } = await supabase.rpc('record_store_payment', {
      _order: o.id, _method: p.method, _amount: Number(p.amount),
      _reference: p.reference || null, _proof_url: p.proof || null,
    });
    setBusy(null);
    if (error) { setOrderError((m) => ({ ...m, [o.id]: error.message })); return; }
    loadOrders();
  }
  async function markPaid(o: Order) {
    setBusy(o.id); setOrderError((m) => { const n = { ...m }; delete n[o.id]; return n; });
    const { error } = await supabase.rpc('mark_store_order_paid', { _order: o.id });
    setBusy(null);
    if (error) { setOrderError((m) => ({ ...m, [o.id]: error.message })); return; }
    loadOrders();
  }
  async function fulfil(o: Order) {
    setBusy(o.id); setOrderError((m) => { const n = { ...m }; delete n[o.id]; return n; });
    const { error } = await supabase.rpc('fulfil_store_order', { _order: o.id, _tracking: track[o.id] || null });
    setBusy(null);
    if (error) { setOrderError((m) => ({ ...m, [o.id]: error.message })); return; }
    loadOrders();
  }
  async function cancel(o: Order) {
    setBusy(o.id); setOrderError((m) => { const n = { ...m }; delete n[o.id]; return n; });
    const { error } = await supabase.rpc('cancel_store_order', { _order: o.id });
    setBusy(null);
    if (error) { setOrderError((m) => ({ ...m, [o.id]: error.message })); return; }
    loadOrders();
  }

  // ---------- Product actions ----------
  const canAdd = np.code.trim().length > 0 && np.name.trim().length > 0 && !addBusy;
  async function addProduct() {
    if (!canAdd) return;
    setAddBusy(true); setAddError(null);
    const { error } = await supabase.rpc('upsert_store_product', {
      _code: np.code.trim(), _name: np.name.trim(),
      _category: np.category.trim() || null,
      _unit_price: Number(np.price || 0), _active: true,
    });
    setAddBusy(false);
    if (error) { setAddError(error.message); return; }
    setNp({ code: '', name: '', category: '', price: '' });
    loadProducts();
  }
  async function toggleProduct(p: Product) {
    setProdBusy(p.id);
    const { error } = await supabase.rpc('upsert_store_product', {
      _code: p.code, _name: p.name, _category: p.category, _unit_price: p.unit_price,
      _description: p.description, _active: !p.active, _sort_order: p.sort_order,
    });
    setProdBusy(null);
    if (error) return;
    loadProducts();
  }

  const prodCounts = useMemo(() => ({
    active: products.filter((p) => p.active).length,
    hidden: products.filter((p) => !p.active).length,
  }), [products]);
  const filteredProducts = useMemo(
    () => products.filter((p) => (prodTab === 'active' ? p.active : !p.active)),
    [products, prodTab],
  );

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Store · admin</p>
        <h1>Store orders</h1>
        <p className="mas-lede">
          Record payments, mark orders paid, and ship. Manage the catalogue below.
        </p>
      </header>

      {/* ---- Orders ---- */}
      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={loadOrders} disabled={orderLoad === 'loading'}>Refresh</button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          {(['placed', 'paid', 'fulfilled'] as OrderTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={orderTab === t}
              className={orderTab === t ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
              onClick={() => { setOrderTab(t); setExpanded(null); }}>
              {ORDER_TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {orderLoad === 'ready' && <span className="mas-admin-count">{orders.length} shown</span>}
      </div>

      {orderLoad === 'loading' && <p className="mas-status">Loading orders…</p>}
      {orderLoad === 'error' && <p className="mas-status mas-status-bad">Couldn’t load orders.</p>}
      {orderLoad === 'ready' && orders.length === 0 && (
        <p className="mas-status">No orders in this state.</p>
      )}

      {orderLoad === 'ready' && orders.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Buyer / centre</th>
                <th>Status</th>
                <th className="mas-num">Total</th>
                <th className="mas-num">Paid</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const p = pay[o.id] ?? { method: 'transfer', amount: '', reference: '', proof: '' };
                const isOpen = expanded === o.id;
                const canExpand = o.status === 'placed' || o.status === 'paid';
                return (
                  <Fragment key={o.id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-cell-strong">
                        {o.buyer || '—'}
                        {o.centre && <span className="mas-cell-sub"> · {o.centre}</span>}
                      </td>
                      <td>{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                      <td className="mas-num">{money(o.total_amount)}</td>
                      <td className="mas-num">{money(o.paid_amount)}</td>
                      <td className="mas-table-actioncol">
                        {o.status === 'fulfilled' && o.tracking && (
                          <span className="mas-cell-sub" style={{ marginRight: '0.6rem' }}>{o.tracking}</span>
                        )}
                        {canExpand && (
                          <button
                            className="mas-link"
                            onClick={() => setExpanded((cur) => (cur === o.id ? null : o.id))}
                          >
                            {isOpen ? 'Close' : 'Manage'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && canExpand && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={5}>
                          <div className="mas-table-detail">
                            {o.shipping_address && (
                              <p className="mas-cell-sub" style={{ marginBottom: '0.5rem' }}>
                                Ship to: {o.shipping_address}
                              </p>
                            )}

                            {o.status === 'placed' && (
                              <>
                                <div className="mas-order-detail">
                                  <label>Method
                                    <select value={p.method} onChange={(e) => setPayField(o.id, { method: e.target.value })}>
                                      <option value="transfer">Bank transfer</option>
                                      <option value="qr">QR pay</option>
                                      <option value="cash">Cash</option>
                                    </select>
                                  </label>
                                  <label>Amount (RM)
                                    <input type="number" value={p.amount} onChange={(e) => setPayField(o.id, { amount: e.target.value })} style={{ width: '8rem' }} />
                                  </label>
                                  <label>Reference
                                    <input type="text" value={p.reference} onChange={(e) => setPayField(o.id, { reference: e.target.value })} style={{ width: '12rem' }} />
                                  </label>
                                  <label>Proof URL
                                    <input type="text" value={p.proof} onChange={(e) => setPayField(o.id, { proof: e.target.value })} style={{ width: '14rem' }} />
                                  </label>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                                  <button className="mas-btn-ghost mas-btn-compact" disabled={busy === o.id} onClick={() => recordPayment(o)}>Record payment</button>
                                  <button className="mas-btn-primary mas-btn-compact" disabled={busy === o.id} onClick={() => markPaid(o)}>Mark paid</button>
                                  <button className="mas-btn-ghost mas-btn-compact" disabled={busy === o.id} onClick={() => cancel(o)}>Cancel order</button>
                                </div>
                              </>
                            )}

                            {o.status === 'paid' && (
                              <>
                                <div className="mas-order-detail">
                                  <label style={{ flex: '1 1 auto' }}>Tracking / dispatch note
                                    <input type="text" value={track[o.id] ?? ''} onChange={(e) => setTrack((t) => ({ ...t, [o.id]: e.target.value }))} placeholder="optional" />
                                  </label>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                                  <button className="mas-btn-primary mas-btn-compact" disabled={busy === o.id} onClick={() => fulfil(o)}>Mark shipped</button>
                                  <button className="mas-btn-ghost mas-btn-compact" disabled={busy === o.id} onClick={() => cancel(o)}>Cancel order</button>
                                </div>
                              </>
                            )}

                            {orderError[o.id] && (
                              <p className="mas-status mas-status-bad" style={{ marginTop: '0.4rem' }}>
                                {orderError[o.id]}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Catalogue ---- */}
      <header className="mas-page-head mas-section-head" style={{ marginTop: '2rem' }}>
        <h2>Catalogue</h2>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={loadProducts} disabled={prodLoad === 'loading'}>Refresh</button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={prodTab === 'active'}
            className={prodTab === 'active' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setProdTab('active')}>Active ({prodCounts.active})</button>
          <button role="tab" aria-selected={prodTab === 'hidden'}
            className={prodTab === 'hidden' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setProdTab('hidden')}>Hidden ({prodCounts.hidden})</button>
        </div>
      </div>

      {addError && <p className="mas-status mas-status-bad">Couldn’t save product: {addError}</p>}

      <div className="mas-table-wrap">
        <table className="mas-table mas-tight">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th className="mas-num">Price</th>
              <th>Status</th>
              <th className="mas-table-actioncol">Action</th>
            </tr>
          </thead>
          <tbody>
            {prodTab === 'active' && (
              <tr className="mas-addrow">
                <td colSpan={6}>
                  <div className="mas-addrow-fields">
                    <input type="text" value={np.code} autoComplete="off"
                      placeholder="unique_code"
                      onChange={(e) => setNp({ ...np, code: e.target.value })} />
                    <input type="text" className="wide" value={np.name}
                      placeholder="Product name"
                      onChange={(e) => setNp({ ...np, name: e.target.value })} />
                    <input type="text" value={np.category}
                      placeholder="Promotion / Teaching"
                      onChange={(e) => setNp({ ...np, category: e.target.value })} />
                    <input type="number" className="num" value={np.price}
                      placeholder="RM"
                      onChange={(e) => setNp({ ...np, price: e.target.value })} />
                    <button className="mas-btn-primary mas-btn-compact" onClick={addProduct} disabled={!canAdd}>
                      {addBusy ? 'Saving…' : '+ Save'}
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {prodLoad === 'loading' && (
              <tr><td colSpan={6} className="mas-status">Loading…</td></tr>
            )}
            {prodLoad === 'error' && (
              <tr><td colSpan={6} className="mas-status mas-status-bad">Couldn’t load products.</td></tr>
            )}
            {prodLoad === 'ready' && filteredProducts.length === 0 && (
              <tr><td colSpan={6} className="mas-status">
                {prodTab === 'active' ? 'No active products.' : 'No hidden products.'}
              </td></tr>
            )}

            {filteredProducts.map((p) => (
              <tr key={p.id}>
                <td className="mas-serial">{p.code}</td>
                <td className="mas-cell-strong">{p.name}</td>
                <td>{p.category || '—'}</td>
                <td className="mas-num">{money(p.unit_price)}</td>
                <td>{p.active ? 'Active' : 'Hidden'}</td>
                <td className="mas-table-actioncol">
                  <button className="mas-link" onClick={() => toggleProduct(p)} disabled={prodBusy === p.id}>
                    {prodBusy === p.id ? '…' : p.active ? 'Hide' : 'Show'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
