import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface CandidateLite { full_name: string; }
interface ResultRow {
  id: string;
  target_level: string;
  outcome: string | null;
  assessed_on: string | null;
  session_id: string;
  candidate: CandidateLite | null;
}
interface SessionRow {
  id: string;
  venue: string | null;
  state: string;
  scheduled_on: string | null;
  status: string;
  examiner_profile_id: string | null;
  partner_center_id: string | null;
}
interface InvoiceRow {
  id: string;
  session_id: string;
  stage: string; // booked_prepay | bonus_reconcile
  status: string; // pro_forma | issued | paid | void
  total: number;
}
interface PayResult {
  paid_to_date: number;
  invoice_total: number;
  status: string;
  fully_paid: boolean;
}
interface PayDraft {
  amount: string;
  method: string;
  reference: string;
}

type Load = 'loading' | 'ready' | 'error';

function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function stageLabel(s: string): string {
  if (s === 'booked_prepay') return 'Booked (prepay)';
  if (s === 'bonus_reconcile') return 'Bonus (reconcile)';
  return pretty(s);
}
function statusLabel(s: string): string {
  if (s === 'pro_forma') return 'Estimate';
  if (s === 'issued') return 'Awaiting payment';
  if (s === 'paid') return 'Paid';
  if (s === 'void') return 'Void';
  return pretty(s);
}

export default function AssessmentsOversight() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [examiners, setExaminers] = useState<Record<string, string>>({});
  const [centres, setCentres] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  // Per-invoice payment-recording state.
  const [pay, setPay] = useState<Record<string, PayDraft>>({});
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<Record<string, string>>({});
  const [payOk, setPayOk] = useState<Record<string, PayResult>>({});

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const [s, r, ex, ce, inv] = await Promise.all([
      supabase
        .from('assessment_sessions')
        .select('id, venue, state, scheduled_on, status, examiner_profile_id, partner_center_id')
        .order('scheduled_on', { ascending: false }),
      supabase
        .from('assessment_results')
        .select('id, target_level, outcome, assessed_on, session_id, candidate:candidates ( full_name )'),
      supabase.rpc('list_examiners'),
      supabase.from('partner_centers').select('id, name'),
      // Assessment invoices for the payment surface. RLS scopes reads to the
      // billing role (system_admin); other governance roles see an empty list.
      supabase.from('invoices').select('id, session_id, stage, status, total').order('created_at'),
    ]);

    if (s.error || r.error) {
      setLoad('error');
      return;
    }
    setSessions((s.data ?? []) as SessionRow[]);
    setResults((r.data ?? []) as unknown as ResultRow[]);
    setInvoices((inv.data ?? []) as InvoiceRow[]);

    const exMap: Record<string, string> = {};
    for (const e of (ex.data ?? []) as { profile_id: string; full_name: string | null; email: string | null }[]) {
      exMap[e.profile_id] = e.full_name || e.email || e.profile_id;
    }
    setExaminers(exMap);

    const ceMap: Record<string, string> = {};
    for (const c of (ce.data ?? []) as { id: string; name: string }[]) ceMap[c.id] = c.name;
    setCentres(ceMap);

    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const resultsBySession = useMemo(() => {
    const map: Record<string, ResultRow[]> = {};
    for (const r of results) (map[r.session_id] ??= []).push(r);
    return map;
  }, [results]);

  const invoicesBySession = useMemo(() => {
    const map: Record<string, InvoiceRow[]> = {};
    for (const i of invoices) (map[i.session_id] ??= []).push(i);
    return map;
  }, [invoices]);

  async function recordPayment(inv: InvoiceRow) {
    const d = pay[inv.id] ?? { amount: '', method: 'transfer', reference: '' };
    setPayErr((m) => {
      const n = { ...m };
      delete n[inv.id];
      return n;
    });

    const amt = Number(d.amount);
    if (!d.amount || Number.isNaN(amt) || amt <= 0) {
      setPayErr((m) => ({ ...m, [inv.id]: 'Enter a positive amount.' }));
      return;
    }

    setPayBusy(inv.id);
    const { data, error } = await supabase.rpc('record_payment', {
      _invoice_id: inv.id,
      _amount: amt,
      _method: d.method || null,
      _reference: d.reference || null,
    });
    setPayBusy(null);

    if (error) {
      setPayErr((m) => ({ ...m, [inv.id]: error.message }));
      return;
    }
    setPayOk((m) => ({ ...m, [inv.id]: data as PayResult }));
    // Refresh so the invoice status (and any unlocked issuance gate) reflects the payment.
    fetchAll();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Assessments oversight</h1>
        <p className="mas-lede">
          Every assessment session and its roster across the programme. Record
          verified payments against a session’s invoices to unlock certificate
          issuance.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchAll} disabled={load === 'loading'}>Refresh</button>
        {load === 'ready' && <span className="mas-admin-count">{sessions.length} sessions</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load sessions.</p>}
      {load === 'ready' && sessions.length === 0 && (
        <p className="mas-status">No sessions scheduled yet.</p>
      )}

      {load === 'ready' &&
        sessions.map((s) => {
          const roster = resultsBySession[s.id] ?? [];
          const invoiceList = invoicesBySession[s.id] ?? [];
          return (
            <div key={s.id} className="mas-grade-session">
              <div className="mas-grade-session-head">
                <h2 className="mas-admin-name">{s.venue || 'Assessment session'}</h2>
                <p className="mas-admin-sub">
                  {s.state}
                  {s.scheduled_on ? ` · ${s.scheduled_on}` : ''}
                  {` · ${s.status}`}
                  {s.examiner_profile_id ? ` · ${examiners[s.examiner_profile_id] ?? 'Examiner'}` : ' · unassigned'}
                  {s.partner_center_id ? ` · ${centres[s.partner_center_id] ?? 'Centre'}` : ''}
                </p>
              </div>
              {roster.length === 0 ? (
                <p className="mas-status">No candidates rostered.</p>
              ) : (
                <ul className="mas-admin-list">
                  {roster.map((r) => (
                    <li key={r.id} className="mas-admin-row">
                      <div className="mas-admin-main">
                        <h3 className="mas-admin-name">{r.candidate?.full_name ?? 'Candidate'}</h3>
                        <p className="mas-admin-meta">
                          <span className="mas-pill">{pretty(r.target_level)}</span>
                          {r.outcome ? (
                            <span className={`mas-outcome ${r.outcome === 'pass' ? 'is-pass' : 'is-refer'}`}>
                              {r.outcome === 'pass' ? 'Passed' : 'Referred'}
                              {r.assessed_on ? ` · ${r.assessed_on}` : ''}
                            </span>
                          ) : (
                            <span className="mas-admin-sub">Not yet graded</span>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {invoiceList.length > 0 && (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--mas-line)', paddingTop: '0.75rem' }}>
                  <p className="mas-field-label">Payments</p>
                  {invoiceList.map((inv) => {
                    const settled = inv.status === 'paid' || inv.status === 'void';
                    const d = pay[inv.id] ?? { amount: '', method: 'transfer', reference: '' };
                    const ok = payOk[inv.id];
                    return (
                      <div key={inv.id} style={{ marginBottom: '0.75rem' }}>
                        <p className="mas-admin-meta">
                          <span className="mas-pill">{stageLabel(inv.stage)}</span>
                          <span className={`mas-outcome ${inv.status === 'paid' ? 'is-pass' : 'is-refer'}`}>
                            {statusLabel(inv.status)}
                          </span>
                          <span className="mas-admin-sub">{money(inv.total)}</span>
                        </p>

                        {!settled && (
                          <>
                            <div className="mas-form-grid" style={{ marginTop: '0.5rem' }}>
                              <div className="mas-field">
                                <label className="mas-field-label">Amount (RM)</label>
                                <input
                                  className="mas-input"
                                  type="number"
                                  value={d.amount}
                                  onChange={(e) => setPay((p) => ({ ...p, [inv.id]: { ...d, amount: e.target.value } }))}
                                />
                              </div>
                              <div className="mas-field">
                                <label className="mas-field-label">Method</label>
                                <select
                                  className="mas-select"
                                  value={d.method}
                                  onChange={(e) => setPay((p) => ({ ...p, [inv.id]: { ...d, method: e.target.value } }))}
                                >
                                  <option value="transfer">Bank transfer</option>
                                  <option value="qr">QR pay</option>
                                  <option value="cash">Cash</option>
                                </select>
                              </div>
                              <div className="mas-field">
                                <label className="mas-field-label">
                                  Reference <span className="mas-field-opt">(optional)</span>
                                </label>
                                <input
                                  className="mas-input"
                                  value={d.reference}
                                  onChange={(e) => setPay((p) => ({ ...p, [inv.id]: { ...d, reference: e.target.value } }))}
                                />
                              </div>
                            </div>
                            <div className="mas-form-actions" style={{ justifyContent: 'flex-start', marginTop: '0.5rem' }}>
                              <button
                                className="mas-btn-primary"
                                disabled={payBusy === inv.id}
                                onClick={() => recordPayment(inv)}
                              >
                                {payBusy === inv.id ? 'Recording…' : 'Record payment'}
                              </button>
                            </div>
                          </>
                        )}

                        {payErr[inv.id] && <p className="mas-status mas-status-bad">{payErr[inv.id]}</p>}
                        {ok && (
                          <p className={`mas-status ${ok.fully_paid ? 'mas-status-good' : ''}`}>
                            Recorded. Paid {money(ok.paid_to_date)} of {money(ok.invoice_total)} ·{' '}
                            {statusLabel(ok.status)}
                            {ok.fully_paid ? ' · fully paid' : ''}.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </section>
  );
}
