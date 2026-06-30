// Instructor's own invoices. This doubles as the instructor's view of the
// sessions they booked (one invoice per session), so the "Cancel session"
// action lives here. Verified wired against the backend:
//   list   ← list_my_invoices() → invoice_id, session_id, status, total, currency,
//            receipt_no, paid_at, venue, scheduled_on, created_at
//            (20260622250000_list_my_invoices.sql). Line items read separately
//            from invoice_items (exposed by RLS for a visible invoice).
//   cancel ← cancel_session(_session_id) → { session_id, status, within_72h,
//            refund_due }. Caller must be the booking instructor or governance;
//            >72h before a paid session creates a refund obligation, ≤72h
//            forfeits, an unpaid session voids its invoice. The backend is the
//            gate — invalid cancellations surface as an inline error.
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
interface CancelResult {
  session_id: string;
  status: string;
  within_72h: boolean;
  refund_due: boolean;
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

  // Session cancellation state, keyed by session_id.
  const [confirmInv, setConfirmInv] = useState<MyInvoice | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<Record<string, CancelResult>>({});
  const [cancelError, setCancelError] = useState<Record<string, string>>({});

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

  async function cancelSession(inv: MyInvoice) {
    setConfirmInv(null);
    setCancelError((m) => {
      const n = { ...m };
      delete n[inv.session_id];
      return n;
    });
    setCancelBusy(inv.session_id);
    const { data, error } = await supabase.rpc('cancel_session', { _session_id: inv.session_id });
    setCancelBusy(null);
    if (error) {
      setCancelError((m) => ({ ...m, [inv.session_id]: error.message }));
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as CancelResult | null;
    if (result) setCancelResult((m) => ({ ...m, [inv.session_id]: result }));
    await fetchInvoices();
  }

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

  // A session can carry more than one invoice (e.g. a bonus reconcile). Show the
  // Cancel-session control once per session — on its first invoice row.
  const primaryInvoiceBySession = new Map<string, string>();
  for (const r of rows) {
    if (!primaryInvoiceBySession.has(r.session_id)) {
      primaryInvoiceBySession.set(r.session_id, r.invoice_id);
    }
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
            const result = cancelResult[inv.session_id];
            const showCancel =
              primaryInvoiceBySession.get(inv.session_id) === inv.invoice_id &&
              inv.status !== 'void' &&
              !result;
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
                <div className="mas-admin-action" style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="mas-btn-ghost" onClick={() => toggle(inv)}>
                    {open ? 'Hide' : 'View'}
                  </button>
                  {showCancel && (
                    <button
                      className="mas-btn-ghost"
                      onClick={() => setConfirmInv(inv)}
                      disabled={cancelBusy === inv.session_id}
                    >
                      {cancelBusy === inv.session_id ? 'Cancelling…' : 'Cancel session'}
                    </button>
                  )}
                </div>

                {result && (
                  <p
                    className="mas-status mas-status-good"
                    style={{ flexBasis: '100%', marginTop: '0.5rem' }}
                  >
                    Session cancelled.{' '}
                    {result.refund_due
                      ? 'A refund will be arranged by the MAS office.'
                      : result.within_72h
                        ? 'Within 72 hours of the session — the fee is non-refundable.'
                        : 'No payment had been made, so the invoice has been voided.'}
                  </p>
                )}
                {cancelError[inv.session_id] && (
                  <p
                    className="mas-status mas-status-bad"
                    style={{ flexBasis: '100%', marginTop: '0.5rem' }}
                  >
                    Couldn’t cancel this session: {cancelError[inv.session_id]}
                  </p>
                )}

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

      {confirmInv && (
        <div
          className="mas-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-cancel-title"
          onClick={() => setConfirmInv(null)}
        >
          <div className="mas-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-cancel-title" className="mas-modal-title">Cancel this session?</h2>
            <p className="mas-modal-body">
              {confirmInv.venue || 'Assessment session'} · {prettyDate(confirmInv.scheduled_on)}
            </p>
            <p className="mas-modal-body">
              If the assessment date is more than 72 hours away and payment was
              made, a refund will be arranged by the MAS office. Within 72 hours,
              the fee is non-refundable. If an examiner has already picked up the
              session, please contact them.
            </p>
            <div className="mas-modal-actions">
              <button className="mas-btn-ghost" onClick={() => setConfirmInv(null)}>Keep session</button>
              <button className="mas-btn-primary" onClick={() => cancelSession(confirmInv)}>
                Cancel session
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
