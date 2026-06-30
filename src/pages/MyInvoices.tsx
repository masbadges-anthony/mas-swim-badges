// Instructor's own invoices, as a dense table (house UI law). Doubles as the
// instructor's booked-session billing view, so "Cancel session" lives here.
//   list   ← list_my_invoices() → invoice_id, session_id, status, total, currency,
//            receipt_no, paid_at, venue, scheduled_on, created_at
//   cancel ← cancel_session(_session_id) → { session_id, status, within_72h, refund_due }
//   View   → /billing/invoice/:invoice_id  (printable A5 invoice)
//   Receipt→ /billing/receipt/:invoice_id  (printable A5 receipt, once paid)
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
interface CancelResult {
  session_id: string;
  status: string;
  within_72h: boolean;
  refund_due: boolean;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'all' | 'outstanding' | 'paid';

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function statusLabel(s: string): string {
  if (s === 'pro_forma') return 'Estimate';
  if (s === 'issued') return 'Awaiting payment';
  if (s === 'paid') return 'Paid';
  if (s === 'void') return 'Void';
  return s;
}

export default function MyInvoices() {
  const [rows, setRows] = useState<MyInvoice[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('all');

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

  function openDoc(kind: 'invoice' | 'receipt', invoiceId: string) {
    window.open(`/billing/${kind}/${invoiceId}`, '_blank', 'noopener');
  }

  // Show Cancel-session once per session (first invoice row of that session).
  const primaryInvoiceBySession = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (!m.has(r.session_id)) m.set(r.session_id, r.invoice_id);
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    if (tab === 'paid') return rows.filter((r) => r.status === 'paid');
    if (tab === 'outstanding') return rows.filter((r) => r.status === 'pro_forma' || r.status === 'issued');
    return rows;
  }, [rows, tab]);

  const counts = useMemo(() => ({
    all: rows.length,
    outstanding: rows.filter((r) => r.status === 'pro_forma' || r.status === 'issued').length,
    paid: rows.filter((r) => r.status === 'paid').length,
  }), [rows]);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Billing</p>
        <h1>My invoices</h1>
        <p className="mas-lede">
          Assessment fees for the sessions you booked. Payment is arranged with the MAS
          office; once recorded, your receipt number appears and certificates are issued.
          Open an invoice to view or print it.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchInvoices} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          {(['all', 'outstanding', 'paid'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
              onClick={() => setTab(t)}
            >
              {t === 'all' ? 'All' : t === 'outstanding' ? 'Outstanding' : 'Paid'} ({counts[t]})
            </button>
          ))}
        </div>
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load invoices.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No invoices in this view.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th>Venue / date</th>
                <th>Status</th>
                <th className="mas-num">Total</th>
                <th>Receipt</th>
                <th className="mas-table-actioncol">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const paid = inv.status === 'paid';
                const result = cancelResult[inv.session_id];
                const showCancel =
                  primaryInvoiceBySession.get(inv.session_id) === inv.invoice_id &&
                  inv.status !== 'void' &&
                  !result;
                return (
                  <Fragment key={inv.invoice_id}>
                    <tr>
                      <td className="mas-cell-strong">
                        <span className="mas-cell-stack">
                          <span>{inv.venue || 'Assessment session'}</span>
                          <span className="mas-cell-sub">{prettyDate(inv.scheduled_on)}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`mas-outcome ${paid ? 'is-pass' : 'is-refer'}`}>
                          {statusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="mas-num">{money(inv.total)}</td>
                      <td>{inv.receipt_no ?? '—'}</td>
                      <td className="mas-table-actioncol">
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            className="mas-btn-ghost mas-btn-compact"
                            onClick={() => openDoc('invoice', inv.invoice_id)}
                          >
                            View
                          </button>
                          {paid && (
                            <button
                              className="mas-btn-ghost mas-btn-compact"
                              onClick={() => openDoc('receipt', inv.invoice_id)}
                            >
                              Receipt
                            </button>
                          )}
                          {showCancel && (
                            <button
                              className="mas-btn-ghost mas-btn-compact"
                              onClick={() => setConfirmInv(inv)}
                              disabled={cancelBusy === inv.session_id}
                            >
                              {cancelBusy === inv.session_id ? 'Cancelling…' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {(result || cancelError[inv.session_id]) && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={5}>
                          {result && (
                            <p className="mas-status mas-status-good" style={{ margin: 0 }}>
                              Session cancelled.{' '}
                              {result.refund_due
                                ? 'A refund will be arranged by the MAS office.'
                                : result.within_72h
                                  ? 'Within 72 hours of the session — the fee is non-refundable.'
                                  : 'No payment had been made, so the invoice has been voided.'}
                            </p>
                          )}
                          {cancelError[inv.session_id] && (
                            <p className="mas-status mas-status-bad" style={{ margin: 0 }}>
                              Couldn’t cancel this session: {cancelError[inv.session_id]}
                            </p>
                          )}
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
              If the assessment date is more than 72 hours away and payment was made, a
              refund will be arranged by the MAS office. Within 72 hours, the fee is
              non-refundable. If an examiner has already picked up the session, please
              contact them.
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
