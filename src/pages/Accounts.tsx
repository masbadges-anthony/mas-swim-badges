import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface SessionOverview {
  session_id: string;
  status: string;
  venue: string | null;
  scheduled_on: string | null;
  state: string | null;
  instructor_name: string | null;
  centre_name: string | null;
  examiner_name: string | null;
  candidate_count: number;
  invited_count: number;
  invoice_status: string | null;
  invoice_paid: boolean;
  payout_recorded: boolean;
}
interface Invoice {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  currency: string;
  receipt_no: string | null;
  paid_at: string | null;
}
interface InvoiceItem {
  id: string;
  item_type: string;
  description: string | null;
  level: string | null;
  quantity: number;
  unit_amount: number;
  amount: number;
}

type Load = 'loading' | 'ready' | 'error';
type Filter = 'active' | 'closed' | 'archived';

const ACTIVE = ['requested', 'examiner_invited', 'scheduled', 'completed'];

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function Accounts() {
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [filter, setFilter] = useState<Filter>('active');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [expectedPayout, setExpectedPayout] = useState<number | null>(null);
  const [detailLoad, setDetailLoad] = useState<Load>('ready');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutRef, setPayoutRef] = useState('');

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_sessions_overview');
    if (error) {
      setLoad('error');
      return;
    }
    setSessions((data ?? []) as SessionOverview[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadDetail = useCallback(async (sessionId: string) => {
    setDetailLoad('loading');
    setInvoice(null);
    setItems([]);
    setExpectedPayout(null);

    const { data: inv } = await supabase
      .from('invoices')
      .select('id, status, subtotal, total, currency, receipt_no, paid_at')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (inv) {
      setInvoice(inv as Invoice);
      const { data: its } = await supabase
        .from('invoice_items')
        .select('id, item_type, description, level, quantity, unit_amount, amount')
        .eq('invoice_id', (inv as Invoice).id)
        .order('created_at');
      setItems((its ?? []) as InvoiceItem[]);
      setPayAmount(String((inv as Invoice).total ?? ''));
    }

    const { data: payout } = await supabase.rpc('expected_examiner_payout', {
      _session_id: sessionId,
    });
    if (payout != null) {
      setExpectedPayout(Number(payout));
      setPayoutAmount(String(Number(payout)));
    }

    setDetailLoad('ready');
  }, []);

  function select(sessionId: string) {
    setNotice(null);
    setError(null);
    if (selectedId === sessionId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(sessionId);
    loadDetail(sessionId);
  }

  async function run(action: string, fn: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setBusy(action);
    setNotice(null);
    setError(null);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      setError(error.message);
      return false;
    }
    setNotice(ok);
    if (selectedId) await loadDetail(selectedId);
    await fetchSessions();
    return true;
  }

  const sel = sessions.find((s) => s.session_id === selectedId) ?? null;

  const shown = sessions.filter((s) => {
    if (filter === 'active') return ACTIVE.includes(s.status);
    return s.status === filter;
  });

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Accounts</p>
        <h1>Assessment billing</h1>
        <p className="mas-lede">
          Build invoices, record payments, issue certificates on payment, settle
          examiner payouts, and close out sessions.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchSessions} disabled={load === 'loading'}>
          Refresh
        </button>
        <select
          className="mas-select"
          value={filter}
          onChange={(e) => { setFilter(e.target.value as Filter); setSelectedId(null); }}
          style={{ maxWidth: '12rem' }}
        >
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </select>
        {load === 'ready' && <span className="mas-admin-count">{shown.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load sessions.</p>}
      {load === 'ready' && shown.length === 0 && <p className="mas-status">No sessions here.</p>}

      {load === 'ready' && shown.length > 0 && (
        <ul className="mas-admin-list">
          {shown.map((s) => {
            const open = selectedId === s.session_id;
            return (
              <li key={s.session_id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
                <div className="mas-admin-main">
                  <h2 className="mas-admin-name">
                    {s.venue || pretty(s.state) || 'Assessment session'}
                  </h2>
                  <p className="mas-admin-meta">
                    <span className="mas-pill">{pretty(s.status)}</span>
                    <span className="mas-admin-sub">
                      {prettyDate(s.scheduled_on)}
                      {s.instructor_name ? ` · ${s.instructor_name}` : ''}
                      {s.centre_name ? ` · ${s.centre_name}` : ''}
                      {` · ${Number(s.candidate_count)} candidate${Number(s.candidate_count) === 1 ? '' : 's'}`}
                      {s.examiner_name ? ` · examiner: ${s.examiner_name}` : ' · examiner: pending'}
                    </span>
                  </p>
                  <p className="mas-admin-meta">
                    <span className={`mas-outcome ${s.invoice_paid ? 'is-pass' : 'is-refer'}`}>
                      {s.invoice_status ? `Invoice: ${pretty(s.invoice_status)}` : 'No invoice'}
                    </span>
                    <span className={`mas-outcome ${s.payout_recorded ? 'is-pass' : 'is-refer'}`}>
                      {s.payout_recorded ? 'Payout recorded' : 'Payout pending'}
                    </span>
                  </p>
                </div>
                <div className="mas-admin-action">
                  <button className="mas-btn-ghost" onClick={() => select(s.session_id)}>
                    {open ? 'Close' : 'Manage'}
                  </button>
                </div>

                {open && sel && (
                  <div style={{ flexBasis: '100%', marginTop: '0.75rem' }} className="mas-form">
                    {notice && <p className="mas-status mas-status-good">{notice}</p>}
                    {error && <p className="mas-status mas-status-bad">{error}</p>}
                    {detailLoad === 'loading' && <p className="mas-status">Loading invoice…</p>}

                    {/* Invoice */}
                    <header className="mas-page-head mas-section-head"><h3>Invoice</h3></header>
                    {!invoice ? (
                      <>
                        <p className="mas-status">No invoice yet.</p>
                        <div className="mas-form-actions">
                          <button
                            className="mas-btn-primary"
                            disabled={busy === 'build'}
                            onClick={() =>
                              run('build',
                                () => supabase.rpc('build_session_invoice', { _session_id: sel.session_id }).then((r) => ({ error: r.error })),
                                'Invoice built.')
                            }
                          >
                            {busy === 'build' ? 'Building…' : 'Build invoice'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
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
                        <p className="mas-admin-meta">
                          <span className="mas-pill">{pretty(invoice.status)}</span>
                          <span className="mas-admin-sub">
                            Subtotal {money(invoice.subtotal)} · <strong>Total {money(invoice.total)}</strong>
                            {invoice.receipt_no ? ` · receipt ${invoice.receipt_no}` : ''}
                          </span>
                        </p>
                        {invoice.status !== 'paid' && (
                          <div className="mas-form-actions">
                            <button
                              className="mas-btn-ghost"
                              disabled={busy === 'build'}
                              onClick={() =>
                                run('build',
                                  () => supabase.rpc('build_session_invoice', { _session_id: sel.session_id }).then((r) => ({ error: r.error })),
                                  'Invoice rebuilt.')
                              }
                            >
                              {busy === 'build' ? 'Rebuilding…' : 'Rebuild from roster'}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* Payment */}
                    {invoice && invoice.status !== 'paid' && (
                      <>
                        <header className="mas-page-head mas-section-head"><h3>Record payment</h3></header>
                        <div className="mas-field">
                          <label className="mas-field-label">Amount</label>
                          <input className="mas-input" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                        </div>
                        <div className="mas-field">
                          <label className="mas-field-label">Method</label>
                          <input className="mas-input" type="text" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} />
                        </div>
                        <div className="mas-field">
                          <label className="mas-field-label">Reference</label>
                          <input className="mas-input" type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="proof / receipt reference" />
                        </div>
                        <div className="mas-form-actions">
                          <button
                            className="mas-btn-primary"
                            disabled={busy === 'pay' || !payAmount}
                            onClick={() =>
                              run('pay',
                                () => supabase.rpc('record_invoice_payment', {
                                  _invoice_id: invoice.id,
                                  _amount: Number(payAmount),
                                  _method: payMethod || null,
                                  _reference: payRef || null,
                                }).then((r) => ({ error: r.error })),
                                'Payment recorded; invoice marked paid.')
                            }
                          >
                            {busy === 'pay' ? 'Recording…' : 'Record payment'}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Certificates */}
                    {invoice && invoice.status === 'paid' && (
                      <>
                        <header className="mas-page-head mas-section-head"><h3>Certificates</h3></header>
                        <div className="mas-form-actions">
                          <button
                            className="mas-btn-primary"
                            disabled={busy === 'issue'}
                            onClick={() =>
                              run('issue',
                                () => supabase.rpc('issue_certificates_for_session', { _session_id: sel.session_id }).then((r) => ({ error: r.error })),
                                'Certificates issued for all passing candidates.')
                            }
                          >
                            {busy === 'issue' ? 'Issuing…' : 'Issue certificates'}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Examiner payout */}
                    <header className="mas-page-head mas-section-head"><h3>Examiner payout</h3></header>
                    <p className="mas-admin-sub">
                      Expected: {expectedPayout == null ? '—' : money(expectedPayout)}
                      {sel.payout_recorded ? ' · recorded' : ''}
                    </p>
                    {!sel.payout_recorded && (
                      <>
                        <div className="mas-field">
                          <label className="mas-field-label">Payout amount</label>
                          <input className="mas-input" type="number" step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
                        </div>
                        <div className="mas-field">
                          <label className="mas-field-label">Reference</label>
                          <input className="mas-input" type="text" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="payout proof / receipt" />
                        </div>
                        <div className="mas-form-actions">
                          <button
                            className="mas-btn-primary"
                            disabled={busy === 'payout' || !payoutAmount || !sel.examiner_name}
                            onClick={() =>
                              run('payout',
                                () => supabase.rpc('record_examiner_payout', {
                                  _session_id: sel.session_id,
                                  _amount: Number(payoutAmount),
                                  _reference: payoutRef || null,
                                }).then((r) => ({ error: r.error })),
                                'Examiner payout recorded.')
                            }
                          >
                            {busy === 'payout' ? 'Recording…' : 'Record payout'}
                          </button>
                        </div>
                        {!sel.examiner_name && (
                          <p className="mas-field-note">No examiner assigned yet — assign one before recording a payout.</p>
                        )}
                      </>
                    )}

                    {/* Close / archive */}
                    <header className="mas-page-head mas-section-head"><h3>Close out</h3></header>
                    <div className="mas-form-actions">
                      {sel.status !== 'closed' && sel.status !== 'archived' && (
                        <button
                          className="mas-btn-primary"
                          disabled={busy === 'close' || !sel.invoice_paid || !sel.payout_recorded}
                          onClick={() =>
                            run('close',
                              () => supabase.rpc('close_session', { _session_id: sel.session_id }).then((r) => ({ error: r.error })),
                              'Session closed.')
                          }
                        >
                          {busy === 'close' ? 'Closing…' : 'Close session'}
                        </button>
                      )}
                      {sel.status === 'closed' && (
                        <button
                          className="mas-btn-ghost"
                          disabled={busy === 'archive'}
                          onClick={() =>
                            run('archive',
                              () => supabase.rpc('archive_session', { _session_id: sel.session_id }).then((r) => ({ error: r.error })),
                              'Session archived.')
                          }
                        >
                          {busy === 'archive' ? 'Archiving…' : 'Archive session'}
                        </button>
                      )}
                    </div>
                    {sel.status !== 'closed' && sel.status !== 'archived' && (!sel.invoice_paid || !sel.payout_recorded) && (
                      <p className="mas-field-note">
                        Closing needs both the invoice paid and the examiner payout recorded.
                      </p>
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
