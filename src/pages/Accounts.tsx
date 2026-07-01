// #16 — Accounts / Examiner payouts, dense-table conversion.
//
// Tight-row style matching Invoices & Payments: single-line rows, plain text
// links, no pill styles, wide page. Payout form still lives inline in an
// expanded detail row (record_examiner_payout needs real inputs).
//
// Wire (unchanged where used):
//   list  ← list_sessions_overview() → session_id, status, venue, scheduled_on,
//           state, examiner_name, invoice_paid, payout_recorded, …
//   expected ← expected_examiner_payout(_session_id) → number
//   pay   ← record_examiner_payout(_session_id, _amount, _reference)
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
type Load = 'loading' | 'ready' | 'error';
type Tab = 'awaiting' | 'paid' | 'archived';

const TERMINAL = new Set(['completed', 'closed', 'archived']);

const CSS = `
.mas-page.mas-page-wide { max-width: none !important; width: auto !important; margin-left: 0 !important; margin-right: 0 !important; }
.mas-tight th, .mas-tight td { padding: 0.35rem 0.6rem; white-space: nowrap; vertical-align: middle; }
.mas-tight tbody tr { line-height: 1.3; }
.mas-tight .mas-link { color: var(--mas-navy, #1E2752); text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
.mas-tight .mas-link:hover { text-decoration: none; }
.mas-tight .mas-link + .mas-link { margin-left: 0.6rem; }
.mas-payout-form { display:flex; gap:0.5rem; align-items:end; flex-wrap:wrap; }
.mas-payout-form label { display:flex; flex-direction:column; font-size:0.8rem; color:var(--mas-muted,#5b6472); }
.mas-payout-form input {
  font:inherit; padding:0.35rem 0.5rem; border:1px solid var(--mas-line,#e3e9f3); border-radius:6px;
}
`;

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

type PayoutBucket = 'awaiting' | 'paid' | 'archived' | 'not_ready';
function payoutBucket(s: SessionOverview): PayoutBucket {
  if (s.status === 'archived') return 'archived';
  if (s.payout_recorded) return 'paid';
  if (s.invoice_paid && TERMINAL.has(s.status)) return 'awaiting';
  return 'not_ready';
}

export default function Accounts() {
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('awaiting');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [expected, setExpected] = useState<Record<string, number | null>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowOk, setRowOk] = useState<Record<string, string>>({});

  const fetchSessions = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_sessions_overview');
    if (error) { setLoad('error'); return; }
    setSessions((data ?? []) as SessionOverview[]);
    setLoad('ready');
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const loadExpected = useCallback(async (sessionId: string) => {
    if (expected[sessionId] != null) return;
    const { data } = await supabase.rpc('expected_examiner_payout', { _session_id: sessionId });
    const n = data == null ? null : Number(data);
    setExpected((m) => ({ ...m, [sessionId]: n }));
    if (n != null) setAmount((m) => (m[sessionId] ? m : { ...m, [sessionId]: String(n) }));
  }, [expected]);

  function toggleExpand(sessionId: string) {
    setExpanded((cur) => {
      const next = cur === sessionId ? null : sessionId;
      if (next) loadExpected(sessionId);
      return next;
    });
  }

  async function recordPayout(s: SessionOverview) {
    const amt = Number(amount[s.session_id] ?? '');
    if (!amt || amt <= 0) {
      setRowError((m) => ({ ...m, [s.session_id]: 'Enter a positive amount.' }));
      return;
    }
    setBusy(s.session_id);
    setRowError((m) => { const n = { ...m }; delete n[s.session_id]; return n; });
    setRowOk((m) => { const n = { ...m }; delete n[s.session_id]; return n; });
    const { error } = await supabase.rpc('record_examiner_payout', {
      _session_id: s.session_id,
      _amount: amt,
      _reference: (reference[s.session_id] ?? '').trim() || null,
    });
    setBusy(null);
    if (error) {
      setRowError((m) => ({ ...m, [s.session_id]: error.message }));
      return;
    }
    setRowOk((m) => ({ ...m, [s.session_id]: `Payout of ${money(amt)} recorded.` }));
    fetchSessions();
  }

  const counts = useMemo(() => {
    const c = { awaiting: 0, paid: 0, archived: 0 };
    for (const s of sessions) {
      const b = payoutBucket(s);
      if (b !== 'not_ready') c[b]++;
    }
    return c;
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => payoutBucket(s) === tab)
      .filter((s) =>
        !q ||
        (s.venue ?? '').toLowerCase().includes(q) ||
        (s.state ?? '').toLowerCase().includes(q) ||
        (s.examiner_name ?? '').toLowerCase().includes(q) ||
        (s.centre_name ?? '').toLowerCase().includes(q));
  }, [sessions, tab, query]);

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Accounts</p>
        <h1>Examiner payouts</h1>
        <p className="mas-lede">
          Record payments out to examiners for completed, invoiced sessions. A payout
          becomes actionable once the session invoice has been paid. Invoicing and
          money-in live in <em>Billing · Invoices &amp; Payments</em>; certificate
          release and session close happen automatically.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchSessions} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'awaiting'}
            className={tab === 'awaiting' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => { setTab('awaiting'); setExpanded(null); }}>
            Awaiting payout ({counts.awaiting})
          </button>
          <button role="tab" aria-selected={tab === 'paid'}
            className={tab === 'paid' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => { setTab('paid'); setExpanded(null); }}>
            Paid ({counts.paid})
          </button>
          <button role="tab" aria-selected={tab === 'archived'}
            className={tab === 'archived' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => { setTab('archived'); setExpanded(null); }}>
            Archived ({counts.archived})
          </button>
        </div>
        <input className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search venue, state, examiner, centre"
          style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load sessions. Refresh to try again.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">
          {tab === 'awaiting' ? 'Nothing awaiting payout right now.'
            : tab === 'paid' ? 'No payouts recorded yet.'
            : 'No archived sessions.'}
        </p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Venue / date</th>
                <th>Centre</th>
                <th>Examiner</th>
                <th className="mas-num">Candidates</th>
                <th>Invoice</th>
                <th>Payout</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const isOpen = expanded === s.session_id;
                const canRecord = tab === 'awaiting' && s.invoice_paid && !s.payout_recorded && !!s.examiner_name;
                return (
                  <Fragment key={s.session_id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-cell-strong">
                        {(s.venue || pretty(s.state) || 'Assessment session')} · {prettyDate(s.scheduled_on)}
                      </td>
                      <td>{s.centre_name || <span className="mas-cell-sub">—</span>}</td>
                      <td>{s.examiner_name || <span className="mas-cell-sub">unassigned</span>}</td>
                      <td className="mas-num">{Number(s.candidate_count)}</td>
                      <td>{s.invoice_status ? pretty(s.invoice_status) : 'None'}</td>
                      <td>{s.payout_recorded ? 'Recorded' : 'Pending'}</td>
                      <td className="mas-table-actioncol">
                        {canRecord && (
                          <button className="mas-link" onClick={() => toggleExpand(s.session_id)}>
                            {isOpen ? 'Close' : 'Record'}
                          </button>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={7}>
                          <div className="mas-table-detail">
                            <p className="mas-cell-sub" style={{ marginBottom: '0.5rem' }}>
                              Expected payout: <strong>{expected[s.session_id] == null ? '…' : money(expected[s.session_id])}</strong>
                              {s.examiner_name ? ` · to ${s.examiner_name}` : ''}
                              {s.payout_recorded ? ' · already recorded' : ''}
                            </p>

                            {canRecord ? (
                              <div className="mas-payout-form">
                                <label>Amount (RM)
                                  <input
                                    type="number" step="0.01"
                                    value={amount[s.session_id] ?? ''}
                                    onChange={(e) => setAmount((m) => ({ ...m, [s.session_id]: e.target.value }))}
                                    style={{ width: '10rem' }}
                                  />
                                </label>
                                <label>Reference
                                  <input
                                    type="text"
                                    value={reference[s.session_id] ?? ''}
                                    onChange={(e) => setReference((m) => ({ ...m, [s.session_id]: e.target.value }))}
                                    placeholder="payout proof / receipt"
                                    style={{ width: '16rem' }}
                                  />
                                </label>
                                <button
                                  className="mas-btn-primary mas-btn-compact"
                                  onClick={() => recordPayout(s)}
                                  disabled={busy === s.session_id}
                                >
                                  {busy === s.session_id ? 'Recording…' : 'Record payout'}
                                </button>
                              </div>
                            ) : (
                              <p className="mas-status">
                                {s.payout_recorded ? 'Payout already recorded.'
                                  : !s.examiner_name ? 'No examiner assigned yet.'
                                  : !s.invoice_paid ? 'Waiting for the session invoice to be paid.'
                                  : 'Not yet actionable.'}
                              </p>
                            )}

                            {rowOk[s.session_id] && (
                              <p className="mas-status mas-status-good" style={{ marginTop: '0.4rem' }}>
                                {rowOk[s.session_id]}
                              </p>
                            )}
                            {rowError[s.session_id] && (
                              <p className="mas-status mas-status-bad" style={{ marginTop: '0.4rem' }}>
                                {rowError[s.session_id]}
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
    </section>
  );
}
