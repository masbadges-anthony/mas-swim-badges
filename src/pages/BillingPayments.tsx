// Billing screen for the finance roles (finance_officer, system_admin,
// chairperson). Unlike MyInvoices — the instructor's read-only view — this
// surface records payments against every assessment invoice. Verified wired
// against the backend:
//   list    ← list_billing_invoices() → invoice_id, receipt_no, stage, status,
//             total, paid_to_date, outstanding, session_id, venue, scheduled_on,
//             session_status, bill_to_name, created_at (unpaid first)
//   record  ← record_payment(_invoice_id, _amount, _method, _reference)
//             → { paid_to_date, invoice_total, status, fully_paid }
//   refunds ← list_refunds_due() → invoice_id, receipt_no, session_id, venue,
//             scheduled_on, bill_to_id, bill_to_name, paid_amount, refunded,
//             refund_due (cancelled sessions with an outstanding refund)
//   payout  ← mark_refund_paid(_invoice_id, _amount, _method, _reference)
//             → { invoice_id, paid_amount, refunded, fully_refunded }
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface BillingInvoice {
  invoice_id: string;
  receipt_no: string | null;
  stage: string;
  status: string;
  total: number;
  paid_to_date: number;
  outstanding: number;
  session_id: string;
  venue: string | null;
  scheduled_on: string | null;
  session_status: string | null;
  bill_to_name: string | null;
  created_at: string;
}

interface Settlement {
  paid_to_date: number;
  invoice_total: number;
  status: string;
  fully_paid: boolean;
}

interface RefundDue {
  invoice_id: string;
  receipt_no: string | null;
  session_id: string;
  venue: string | null;
  scheduled_on: string | null;
  bill_to_id: string | null;
  bill_to_name: string | null;
  paid_amount: number;
  refunded: number;
  refund_due: number;
}

interface RefundResult {
  invoice_id: string;
  paid_amount: number;
  refunded: number;
  fully_refunded: boolean;
}

type Load = 'loading' | 'ready' | 'error';

const METHODS: { value: string; label: string }[] = [
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'qr', label: 'QR / e-wallet' },
  { value: 'cash', label: 'Cash' },
];

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function stageLabel(s: string): string {
  if (s === 'booked_prepay') return 'Booked';
  if (s === 'bonus_reconcile') return 'Bonus';
  return s.replace(/_/g, ' ');
}
function statusLabel(s: string): string {
  if (s === 'pro_forma') return 'Estimate';
  if (s === 'issued') return 'Awaiting payment';
  if (s === 'paid') return 'Paid';
  if (s === 'void') return 'Void';
  return s.replace(/_/g, ' ');
}

export default function BillingPayments() {
  const [rows, setRows] = useState<BillingInvoice[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { amount: string; method: string; reference: string }>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [settled, setSettled] = useState<Record<string, Settlement>>({});

  // Refunds due — cancelled sessions (>72h, paid) awaiting a payout.
  const [refunds, setRefunds] = useState<RefundDue[]>([]);
  const [refundLoad, setRefundLoad] = useState<Load>('loading');
  const [refundBusy, setRefundBusy] = useState<string | null>(null);
  const [refundForms, setRefundForms] = useState<Record<string, { amount: string; method: string; reference: string }>>({});
  const [refundError, setRefundError] = useState<Record<string, string>>({});
  const [refundOk, setRefundOk] = useState<Record<string, RefundResult>>({});

  const fetchInvoices = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_billing_invoices');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as BillingInvoice[]);
    setLoad('ready');
  }, []);

  const fetchRefunds = useCallback(async () => {
    setRefundLoad('loading');
    const { data, error } = await supabase.rpc('list_refunds_due');
    if (error) {
      setRefundLoad('error');
      return;
    }
    setRefunds((data ?? []) as RefundDue[]);
    setRefundLoad('ready');
  }, []);

  const refreshAll = useCallback(() => {
    fetchInvoices();
    fetchRefunds();
  }, [fetchInvoices, fetchRefunds]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  function form(id: string) {
    return forms[id] ?? { amount: '', method: 'transfer', reference: '' };
  }
  function setForm(id: string, patch: Partial<{ amount: string; method: string; reference: string }>) {
    setForms((m) => ({ ...m, [id]: { ...form(id), ...patch } }));
  }
  function clearRowError(id: string) {
    setRowError((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
  }

  async function recordPayment(inv: BillingInvoice) {
    const f = form(inv.invoice_id);
    const amount = Number(f.amount);
    clearRowError(inv.invoice_id);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRowError((m) => ({ ...m, [inv.invoice_id]: 'Enter a payment amount greater than zero.' }));
      return;
    }
    setBusyId(inv.invoice_id);
    const { data, error } = await supabase.rpc('record_payment', {
      _invoice_id: inv.invoice_id,
      _amount: amount,
      _method: f.method,
      _reference: f.reference.trim() || null,
    });
    setBusyId(null);
    if (error) {
      setRowError((m) => ({ ...m, [inv.invoice_id]: error.message }));
      return;
    }
    // record_payment returns a single settlement summary row.
    const summary = (Array.isArray(data) ? data[0] : data) as Settlement | null;
    if (summary) setSettled((m) => ({ ...m, [inv.invoice_id]: summary }));
    setForms((m) => ({ ...m, [inv.invoice_id]: { amount: '', method: f.method, reference: '' } }));
    await fetchInvoices();
  }

  // The refund form defaults its amount to the full outstanding refund_due.
  function refundForm(r: RefundDue) {
    return (
      refundForms[r.invoice_id] ?? {
        amount: Number(r.refund_due).toFixed(2),
        method: 'transfer',
        reference: '',
      }
    );
  }
  function setRefundField(id: string, fallback: RefundDue, patch: Partial<{ amount: string; method: string; reference: string }>) {
    setRefundForms((m) => ({ ...m, [id]: { ...refundForm(fallback), ...patch } }));
  }

  async function markRefund(r: RefundDue) {
    const f = refundForm(r);
    const amount = Number(f.amount);
    setRefundError((m) => {
      const n = { ...m };
      delete n[r.invoice_id];
      return n;
    });
    if (!Number.isFinite(amount) || amount <= 0) {
      setRefundError((m) => ({ ...m, [r.invoice_id]: 'Enter a refund amount greater than zero.' }));
      return;
    }
    setRefundBusy(r.invoice_id);
    const { data, error } = await supabase.rpc('mark_refund_paid', {
      _invoice_id: r.invoice_id,
      _amount: amount,
      _method: f.method,
      _reference: f.reference.trim() || null,
    });
    setRefundBusy(null);
    if (error) {
      setRefundError((m) => ({ ...m, [r.invoice_id]: error.message }));
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as RefundResult | null;
    if (result) setRefundOk((m) => ({ ...m, [r.invoice_id]: result }));
    await fetchRefunds();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Billing</p>
        <h1>Invoices &amp; payments</h1>
        <p className="mas-lede">
          Every assessment invoice with its settlement state — unpaid first.
          Record a payment against an invoice; once it is fully covered the
          invoice flips to paid and the session opens for examiner pickup.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button
          className="mas-btn-ghost"
          onClick={refreshAll}
          disabled={load === 'loading' || refundLoad === 'loading'}
        >
          Refresh
        </button>
        {load === 'ready' && <span className="mas-admin-count">{rows.length} total</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading invoices…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load invoices. Refresh to try again.</p>
      )}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">There are no invoices yet.</p>
      )}

      {load === 'ready' && rows.length > 0 && (
        <ul className="mas-admin-list">
          {rows.map((inv) => {
            const paid = inv.status === 'paid';
            const settleable = inv.status !== 'paid' && inv.status !== 'void';
            const summary = settled[inv.invoice_id];
            const f = form(inv.invoice_id);
            return (
              <li key={inv.invoice_id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
                <div className="mas-admin-main">
                  <h2 className="mas-admin-name">
                    {inv.receipt_no ?? '— (estimate)'}
                    <span className="mas-pill" style={{ marginLeft: '0.5rem' }}>{stageLabel(inv.stage)}</span>
                  </h2>
                  <p className="mas-admin-meta">
                    <span className={`mas-outcome ${paid ? 'is-pass' : 'is-refer'}`}>
                      {statusLabel(inv.status)}
                    </span>
                    <span className="mas-admin-sub">
                      {inv.venue || 'Assessment session'} · {prettyDate(inv.scheduled_on)}
                      {inv.bill_to_name ? ` · ${inv.bill_to_name}` : ''}
                    </span>
                  </p>
                  <p className="mas-admin-meta">
                    <span className="mas-admin-sub">
                      Total <strong>{money(inv.total)}</strong>
                      {' · '}Paid <strong>{money(inv.paid_to_date)}</strong>
                      {' · '}Outstanding <strong>{money(inv.outstanding)}</strong>
                    </span>
                  </p>

                  {settleable && (
                    <div className="mas-grade-actions" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="mas-field mas-grade-field">
                        <label className="mas-field-label" htmlFor={`amount-${inv.invoice_id}`}>
                          Amount (RM)
                        </label>
                        <input
                          id={`amount-${inv.invoice_id}`}
                          className="mas-input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={f.amount}
                          onChange={(e) => setForm(inv.invoice_id, { amount: e.target.value })}
                          placeholder={Number(inv.outstanding).toFixed(2)}
                        />
                      </div>
                      <div className="mas-field mas-grade-field">
                        <label className="mas-field-label" htmlFor={`method-${inv.invoice_id}`}>
                          Method
                        </label>
                        <select
                          id={`method-${inv.invoice_id}`}
                          className="mas-select"
                          value={f.method}
                          onChange={(e) => setForm(inv.invoice_id, { method: e.target.value })}
                        >
                          {METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mas-field mas-grade-field">
                        <label className="mas-field-label" htmlFor={`ref-${inv.invoice_id}`}>
                          Reference (optional)
                        </label>
                        <input
                          id={`ref-${inv.invoice_id}`}
                          className="mas-input"
                          type="text"
                          value={f.reference}
                          onChange={(e) => setForm(inv.invoice_id, { reference: e.target.value })}
                          placeholder="Transaction / receipt ref"
                        />
                      </div>
                      <button
                        className="mas-btn-primary"
                        onClick={() => recordPayment(inv)}
                        disabled={busyId === inv.invoice_id}
                      >
                        {busyId === inv.invoice_id ? 'Recording…' : 'Record payment'}
                      </button>
                    </div>
                  )}

                  {summary && (
                    <p className="mas-status mas-status-good mas-admin-rowerror">
                      Payment recorded — paid {money(summary.paid_to_date)} of {money(summary.invoice_total)}
                      {' · '}{statusLabel(summary.status)}
                      {summary.fully_paid ? ' · session opened for examiner pickup.' : '.'}
                    </p>
                  )}
                  {rowError[inv.invoice_id] && (
                    <p className="mas-status mas-status-bad mas-admin-rowerror">
                      Couldn’t record payment: {rowError[inv.invoice_id]}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- Refunds due ---- */}
      <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--mas-line)', paddingTop: '1.5rem' }}>
        <header className="mas-page-head">
          <p className="mas-eyebrow">Refunds</p>
          <h2>Refunds due</h2>
          <p className="mas-lede">
            Sessions cancelled more than 72 hours ahead with a payment already
            made. Record each refund payout once the office has arranged it.
          </p>
        </header>

        {refundLoad === 'loading' && <p className="mas-status">Loading refunds…</p>}
        {refundLoad === 'error' && (
          <p className="mas-status mas-status-bad">Couldn’t load refunds. Refresh to try again.</p>
        )}
        {refundLoad === 'ready' && refunds.length === 0 && (
          <p className="mas-status">No refunds are due.</p>
        )}

        {refundLoad === 'ready' && refunds.length > 0 && (
          <ul className="mas-admin-list">
            {refunds.map((r) => {
              const f = refundForm(r);
              const ok = refundOk[r.invoice_id];
              return (
                <li key={r.invoice_id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
                  <div className="mas-admin-main">
                    <h3 className="mas-admin-name">
                      {r.receipt_no ?? '— (no receipt)'}
                      <span className="mas-pill" style={{ marginLeft: '0.5rem' }}>Cancelled</span>
                    </h3>
                    <p className="mas-admin-meta">
                      <span className="mas-admin-sub">
                        {r.venue || 'Assessment session'} · {prettyDate(r.scheduled_on)}
                        {r.bill_to_name ? ` · ${r.bill_to_name}` : ''}
                      </span>
                    </p>
                    <p className="mas-admin-meta">
                      <span className="mas-admin-sub">
                        Paid <strong>{money(r.paid_amount)}</strong>
                        {' · '}Refunded <strong>{money(r.refunded)}</strong>
                        {' · '}Refund due <strong>{money(r.refund_due)}</strong>
                      </span>
                    </p>

                    <div className="mas-grade-actions" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div className="mas-field mas-grade-field">
                        <label className="mas-field-label" htmlFor={`refund-amount-${r.invoice_id}`}>
                          Amount (RM)
                        </label>
                        <input
                          id={`refund-amount-${r.invoice_id}`}
                          className="mas-input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={f.amount}
                          onChange={(e) => setRefundField(r.invoice_id, r, { amount: e.target.value })}
                          placeholder={Number(r.refund_due).toFixed(2)}
                        />
                      </div>
                      <div className="mas-field mas-grade-field">
                        <label className="mas-field-label" htmlFor={`refund-method-${r.invoice_id}`}>
                          Method
                        </label>
                        <select
                          id={`refund-method-${r.invoice_id}`}
                          className="mas-select"
                          value={f.method}
                          onChange={(e) => setRefundField(r.invoice_id, r, { method: e.target.value })}
                        >
                          {METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mas-field mas-grade-field">
                        <label className="mas-field-label" htmlFor={`refund-ref-${r.invoice_id}`}>
                          Reference (optional)
                        </label>
                        <input
                          id={`refund-ref-${r.invoice_id}`}
                          className="mas-input"
                          type="text"
                          value={f.reference}
                          onChange={(e) => setRefundField(r.invoice_id, r, { reference: e.target.value })}
                          placeholder="Transaction / payout ref"
                        />
                      </div>
                      <button
                        className="mas-btn-primary"
                        onClick={() => markRefund(r)}
                        disabled={refundBusy === r.invoice_id}
                      >
                        {refundBusy === r.invoice_id ? 'Recording…' : 'Mark refunded'}
                      </button>
                    </div>

                    {ok && (
                      <p className="mas-status mas-status-good mas-admin-rowerror">
                        Refund recorded — refunded {money(ok.refunded)} of {money(ok.paid_amount)}
                        {ok.fully_refunded ? ' · fully refunded.' : '.'}
                      </p>
                    )}
                    {refundError[r.invoice_id] && (
                      <p className="mas-status mas-status-bad mas-admin-rowerror">
                        Couldn’t record refund: {refundError[r.invoice_id]}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
