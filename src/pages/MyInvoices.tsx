import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface MyInvoice {
  invoice_id: string;
  session_id: string;
  status: string;
  total: number;
  currency: string;
  receipt_no: string | null;
  paid_at: string | null;
  venue: string | null;
  scheduled_on: string | null;
  created_at: string;
}
interface InvoiceItem {
  id: string;
  item_type: string;
  description: string | null;
  amount: number;
}

type Load = 'loading' | 'ready' | 'error';

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function statusLabel(s: string): string {
  if (s === 'pro_forma') return 'Estimate';
  if (s === 'issued') return 'Awaiting payment';
  if (s === 'paid') return 'Paid';
  if (s === 'void') return 'Void';
  return pretty(s);
}

export default function MyInvoices() {
  const [rows, setRows] = useState<MyInvoice[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [itemsLoad, setItemsLoad] = useState<Load>('ready');

  const fetchInvoices = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_my_invoices');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as MyInvoice[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  async function toggle(inv: MyInvoice) {
    if (openId === inv.invoice_id) {
      setOpenId(null);
      return;
    }
    setOpenId(inv.invoice_id);
    setItemsLoad('loading');
    setItems([]);
    const { data, error } = await supabase
      .from('invoice_items')
      .select('id, item_type, description, amount')
      .eq('invoice_id', inv.invoice_id)
      .order('created_at');
    if (error) {
      setItemsLoad('error');
      return;
    }
    setItems((data ?? []) as InvoiceItem[]);
    setItemsLoad('ready');
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Billing</p>
        <h1>My invoices</h1>
        <p className="mas-lede">
          Assessment fees for the sessions you booked. Payment is arranged with
          the MAS office; once it’s recorded, your receipt number appears here
          and certificates are issued.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchInvoices} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && <span className="mas-admin-count">{rows.length} total</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load invoices.</p>}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">You have no invoices yet.</p>
      )}

      {load === 'ready' && rows.length > 0 && (
        <ul className="mas-admin-list">
          {rows.map((inv) => {
            const open = openId === inv.invoice_id;
            const paid = inv.status === 'paid';
            return (
              <li key={inv.invoice_id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
                <div className="mas-admin-main">
                  <h2 className="mas-admin-name">
                    {inv.venue || 'Assessment session'} · {prettyDate(inv.scheduled_on)}
                  </h2>
                  <p className="mas-admin-meta">
                    <span className={`mas-outcome ${paid ? 'is-pass' : 'is-refer'}`}>
                      {statusLabel(inv.status)}
                    </span>
                    <span className="mas-admin-sub">
                      {inv.status === 'pro_forma' ? 'Estimate ' : 'Total '}
                      <strong>{money(inv.total)}</strong>
                      {inv.receipt_no ? ` · receipt ${inv.receipt_no}` : ''}
                    </span>
                  </p>
                </div>
                <div className="mas-admin-action">
                  <button className="mas-btn-ghost" onClick={() => toggle(inv)}>
                    {open ? 'Hide' : 'View'}
                  </button>
                </div>

                {open && (
                  <div style={{ flexBasis: '100%', marginTop: '0.75rem' }}>
                    {itemsLoad === 'loading' && <p className="mas-status">Loading…</p>}
                    {itemsLoad === 'error' && (
                      <p className="mas-status mas-status-bad">Couldn’t load the breakdown.</p>
                    )}
                    {itemsLoad === 'ready' && items.length === 0 && (
                      <p className="mas-status">No line items.</p>
                    )}
                    {itemsLoad === 'ready' && items.length > 0 && (
                      <ul className="mas-admin-list">
                        {items.map((it) => (
                          <li key={it.id} className="mas-admin-row">
                            <div className="mas-admin-main">
                              <span className="mas-admin-sub">
                                {it.description || pretty(it.item_type)}
                              </span>
                            </div>
                            <div className="mas-admin-action">{money(it.amount)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
