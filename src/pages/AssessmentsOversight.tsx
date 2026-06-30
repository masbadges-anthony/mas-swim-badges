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
interface InquiryRow {
  id: string;
  session_id: string;
  venue: string | null;
  scheduled_on: string | null;
  examiner_name: string | null;
  reason: string;
  status: string;
  raised_by_name: string | null;
  raised_at: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

type Load = 'loading' | 'ready' | 'error';

// Sessions in these states are finished — swapping their examiner is meaningless.
const SWAP_LOCKED = new Set(['completed', 'closed', 'cancelled']);

function whenLabel(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
  const [examinerList, setExaminerList] = useState<{ id: string; name: string }[]>([]);
  const [centres, setCentres] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  // Per-invoice payment-recording state.
  const [pay, setPay] = useState<Record<string, PayDraft>>({});
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<Record<string, string>>({});
  const [payOk, setPayOk] = useState<Record<string, PayResult>>({});

  // CE/system_admin: swap a session's examiner (server re-runs COI).
  const [swapChoice, setSwapChoice] = useState<Record<string, string>>({});
  const [swapPending, setSwapPending] = useState<string | null>(null); // session awaiting inline confirm
  const [swapBusy, setSwapBusy] = useState<string | null>(null);
  const [swapErr, setSwapErr] = useState<Record<string, string>>({});
  const [swapOk, setSwapOk] = useState<Record<string, string>>({});

  // CE/system_admin: raise a conduct inquiry against a session's examiner.
  const [inqReason, setInqReason] = useState<Record<string, string>>({});
  const [inqBusy, setInqBusy] = useState<string | null>(null);
  const [inqErr, setInqErr] = useState<Record<string, string>>({});
  const [inqOk, setInqOk] = useState<Record<string, boolean>>({});

  // Inquiries panel.
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [inqLoad, setInqLoad] = useState<Load>('loading');
  const [resolveNote, setResolveNote] = useState<Record<string, string>>({});
  const [resolveBusy, setResolveBusy] = useState<string | null>(null);
  const [resolveErr, setResolveErr] = useState<Record<string, string>>({});

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
      // billing roles (finance_officer, system_admin, chairperson); other
      // governance roles see an empty list.
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
    const exList: { id: string; name: string }[] = [];
    for (const e of (ex.data ?? []) as { profile_id: string; full_name: string | null; email: string | null }[]) {
      const name = e.full_name || e.email || e.profile_id;
      exMap[e.profile_id] = name;
      exList.push({ id: e.profile_id, name });
    }
    setExaminers(exMap);
    setExaminerList(exList);

    const ceMap: Record<string, string> = {};
    for (const c of (ce.data ?? []) as { id: string; name: string }[]) ceMap[c.id] = c.name;
    setCentres(ceMap);

    setLoad('ready');
  }, []);

  const fetchInquiries = useCallback(async () => {
    setInqLoad('loading');
    const { data, error } = await supabase.rpc('list_inquiries', { _include_resolved: showResolved });
    if (error) {
      setInqLoad('error');
      return;
    }
    setInquiries((data ?? []) as InquiryRow[]);
    setInqLoad('ready');
  }, [showResolved]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

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

  async function swapExaminer(s: SessionRow) {
    const newId = swapChoice[s.id];
    setSwapErr((m) => {
      const n = { ...m };
      delete n[s.id];
      return n;
    });
    if (!newId) {
      setSwapErr((m) => ({ ...m, [s.id]: 'Choose a replacement examiner first.' }));
      setSwapPending(null);
      return;
    }
    setSwapPending(null);
    setSwapBusy(s.id);
    const { error } = await supabase.rpc('swap_session_examiner', {
      _session_id: s.id,
      _new_examiner: newId,
    });
    setSwapBusy(null);
    if (error) {
      // COI / not-an-active-examiner rejections surface here, inline.
      setSwapErr((m) => ({ ...m, [s.id]: error.message }));
      return;
    }
    setSwapOk((m) => ({ ...m, [s.id]: examiners[newId] ?? 'New examiner' }));
    setSwapChoice((m) => {
      const n = { ...m };
      delete n[s.id];
      return n;
    });
    fetchAll();
  }

  async function raiseInquiry(s: SessionRow) {
    const reason = (inqReason[s.id] ?? '').trim();
    setInqErr((m) => {
      const n = { ...m };
      delete n[s.id];
      return n;
    });
    if (!reason) {
      setInqErr((m) => ({ ...m, [s.id]: 'Enter a reason for the inquiry.' }));
      return;
    }
    setInqBusy(s.id);
    const { error } = await supabase.rpc('raise_inquiry', {
      _session_id: s.id,
      _reason: reason,
    });
    setInqBusy(null);
    if (error) {
      setInqErr((m) => ({ ...m, [s.id]: error.message }));
      return;
    }
    setInqOk((m) => ({ ...m, [s.id]: true }));
    setInqReason((m) => {
      const n = { ...m };
      delete n[s.id];
      return n;
    });
    fetchInquiries();
  }

  async function resolveInquiry(q: InquiryRow) {
    const note = (resolveNote[q.id] ?? '').trim();
    setResolveErr((m) => {
      const n = { ...m };
      delete n[q.id];
      return n;
    });
    if (!note) {
      setResolveErr((m) => ({ ...m, [q.id]: 'Enter a resolution note.' }));
      return;
    }
    setResolveBusy(q.id);
    const { error } = await supabase.rpc('resolve_inquiry', {
      _inquiry_id: q.id,
      _resolution_note: note,
    });
    setResolveBusy(null);
    if (error) {
      setResolveErr((m) => ({ ...m, [q.id]: error.message }));
      return;
    }
    setResolveNote((m) => {
      const n = { ...m };
      delete n[q.id];
      return n;
    });
    fetchInquiries();
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
          const canSwap = !!s.examiner_profile_id && !SWAP_LOCKED.has(s.status);
          const swapOptions = examinerList.filter((e) => e.id !== s.examiner_profile_id);
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

              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--mas-line)', paddingTop: '0.75rem' }}>
                <p className="mas-field-label">Examiner conduct</p>

                {canSwap && (
                  <div className="mas-field" style={{ marginTop: '0.5rem' }}>
                    <label className="mas-field-label" htmlFor={`swap-${s.id}`}>Swap examiner</label>
                    <div className="mas-form-grid" style={{ marginTop: '0.25rem' }}>
                      <div className="mas-field">
                        <select
                          id={`swap-${s.id}`}
                          className="mas-select"
                          value={swapChoice[s.id] ?? ''}
                          disabled={swapBusy === s.id}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSwapChoice((m) => ({ ...m, [s.id]: v }));
                            setSwapPending(null);
                          }}
                        >
                          <option value="">Choose a replacement examiner…</option>
                          {swapOptions.map((e) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mas-field">
                        {swapPending === s.id ? (
                          <div className="mas-form-actions" style={{ justifyContent: 'flex-start' }}>
                            <button className="mas-btn-primary" disabled={swapBusy === s.id} onClick={() => swapExaminer(s)}>
                              {swapBusy === s.id ? 'Swapping…' : `Confirm: ${examiners[swapChoice[s.id]] ?? 'replacement'}`}
                            </button>
                            <button className="mas-btn-ghost" disabled={swapBusy === s.id} onClick={() => setSwapPending(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="mas-form-actions" style={{ justifyContent: 'flex-start' }}>
                            <button
                              className="mas-btn-ghost"
                              disabled={swapBusy === s.id || !swapChoice[s.id]}
                              onClick={() => {
                                setSwapErr((m) => {
                                  const n = { ...m };
                                  delete n[s.id];
                                  return n;
                                });
                                setSwapPending(s.id);
                              }}
                            >
                              Swap examiner
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {swapErr[s.id] && <p className="mas-status mas-status-bad">{swapErr[s.id]}</p>}
                    {swapOk[s.id] && <p className="mas-status mas-status-good">Examiner swapped to {swapOk[s.id]}.</p>}
                  </div>
                )}

                <div className="mas-field" style={{ marginTop: '0.5rem' }}>
                  <label className="mas-field-label" htmlFor={`inq-${s.id}`}>Raise inquiry</label>
                  <div className="mas-form-grid" style={{ marginTop: '0.25rem' }}>
                    <div className="mas-field">
                      <input
                        id={`inq-${s.id}`}
                        className="mas-input"
                        value={inqReason[s.id] ?? ''}
                        placeholder="e.g. Examiner no-show"
                        disabled={inqBusy === s.id}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInqReason((m) => ({ ...m, [s.id]: v }));
                        }}
                      />
                    </div>
                    <div className="mas-field">
                      <div className="mas-form-actions" style={{ justifyContent: 'flex-start' }}>
                        <button className="mas-btn-ghost" disabled={inqBusy === s.id} onClick={() => raiseInquiry(s)}>
                          {inqBusy === s.id ? 'Raising…' : 'Raise inquiry'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {inqErr[s.id] && <p className="mas-status mas-status-bad">{inqErr[s.id]}</p>}
                  {inqOk[s.id] && <p className="mas-status mas-status-good">Inquiry raised — see the inquiries panel below.</p>}
                </div>
              </div>
            </div>
          );
        })}

      <div className="mas-grade-session" style={{ marginTop: '1.5rem' }}>
        <div className="mas-grade-session-head">
          <h2 className="mas-admin-name">Conduct inquiries</h2>
          <p className="mas-admin-sub">
            Open inquiries raised against examiners (e.g. no-shows). Resolve each with a note once handled.
          </p>
        </div>

        <div className="mas-admin-toolbar">
          <button className="mas-btn-ghost" onClick={fetchInquiries} disabled={inqLoad === 'loading'}>Refresh</button>
          <label className="mas-field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
          {inqLoad === 'ready' && <span className="mas-admin-count">{inquiries.length} inquir{inquiries.length === 1 ? 'y' : 'ies'}</span>}
        </div>

        {inqLoad === 'loading' && <p className="mas-status">Loading inquiries…</p>}
        {inqLoad === 'error' && <p className="mas-status mas-status-bad">Couldn’t load inquiries.</p>}
        {inqLoad === 'ready' && inquiries.length === 0 && (
          <p className="mas-status">{showResolved ? 'No inquiries on record.' : 'No open inquiries.'}</p>
        )}

        {inqLoad === 'ready' && inquiries.length > 0 && (
          <ul className="mas-admin-list">
            {inquiries.map((q) => {
              const resolved = q.status === 'resolved';
              return (
                <li key={q.id} className="mas-admin-row">
                  <div className="mas-admin-main">
                    <h3 className="mas-admin-name">{q.venue || 'Assessment session'}</h3>
                    <p className="mas-admin-meta">
                      <span className="mas-pill">{pretty(q.status)}</span>
                      {q.scheduled_on ? <span className="mas-admin-sub">{q.scheduled_on}</span> : null}
                      <span className="mas-admin-sub">Examiner: {q.examiner_name ?? 'Unknown'}</span>
                    </p>
                    <p className="mas-admin-sub" style={{ marginTop: '0.25rem' }}>{q.reason}</p>
                    <p className="mas-admin-sub">
                      Raised by {q.raised_by_name ?? 'Unknown'}
                      {q.raised_at ? ` · ${whenLabel(q.raised_at)}` : ''}
                    </p>
                    {resolved && (
                      <p className="mas-status mas-status-good">
                        Resolved by {q.resolved_by_name ?? 'Unknown'}
                        {q.resolved_at ? ` · ${whenLabel(q.resolved_at)}` : ''}
                        {q.resolution_note ? ` — ${q.resolution_note}` : ''}
                      </p>
                    )}

                    {!resolved && (
                      <>
                        <div className="mas-form-grid" style={{ marginTop: '0.5rem' }}>
                          <div className="mas-field">
                            <label className="mas-field-label" htmlFor={`res-${q.id}`}>Resolution note</label>
                            <input
                              id={`res-${q.id}`}
                              className="mas-input"
                              value={resolveNote[q.id] ?? ''}
                              disabled={resolveBusy === q.id}
                              onChange={(e) => {
                                const v = e.target.value;
                                setResolveNote((m) => ({ ...m, [q.id]: v }));
                              }}
                            />
                          </div>
                          <div className="mas-field">
                            <div className="mas-form-actions" style={{ justifyContent: 'flex-start' }}>
                              <button className="mas-btn-primary" disabled={resolveBusy === q.id} onClick={() => resolveInquiry(q)}>
                                {resolveBusy === q.id ? 'Resolving…' : 'Resolve'}
                              </button>
                            </div>
                          </div>
                        </div>
                        {resolveErr[q.id] && <p className="mas-status mas-status-bad">{resolveErr[q.id]}</p>}
                      </>
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
