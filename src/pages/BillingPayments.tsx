// Billing screen for the finance roles (finance_officer, system_admin,
// chairperson). Unlike MyInvoices — the instructor's read-only view — this
// surface records payments against every assessment invoice. Verified wired
// against the backend:
//   list   ← list_billing_invoices() → invoice_id, receipt_no, stage, status,
//            total, paid_to_date, outstanding, session_id, venue, scheduled_on,
//            session_status, bill_to_name, created_at (unpaid first)
//   record ← record_payment(_invoice_id, _amount, _method, _reference)
//            → { paid_to_date, invoice_total, status, fully_paid }
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

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

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
        <button className="mas-btn-ghost" onClick={fetchInvoices} disabled={load === 'loading'}>
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
    </section>
  );
}
