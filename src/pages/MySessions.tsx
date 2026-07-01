// Universal session tracker (#15). Role-scoped via list_session_tracker():
// governance (chair/sysadmin/finance_officer/chief_examiner/board_member) see ALL
// sessions; everyone else sees sessions they booked OR are assigned to assess.
// Each row: six-step checkpoint bar; expand for both-way contacts (booker + examiner)
// and the cancel action (where the row is yours and cancellable).
//   list   ← list_session_tracker() → session_id, venue, state, scheduled_on, status,
//            receipt_no, invoice_status, cp_* (6), candidate_count, booker_* (3),
//            examiner_* (3), is_mine_booked, is_mine_assigned
//   cancel ← cancel_session(_session_id) → { session_id, status, within_72h, refund_due }
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import CheckpointBar from '../components/CheckpointBar';
import '../styles/admin.css';

interface TrackerRow {
  session_id: string;
  venue: string | null;
  state: string | null;
  scheduled_on: string | null;
  status: string;
  receipt_no: string | null;
  invoice_status: string | null;
  cp_created: boolean;
  cp_roster: boolean;
  cp_paid: boolean;
  cp_examiner: boolean;
  cp_completed: boolean;
  cp_certs: boolean;
  candidate_count: number;
  booker_name: string | null;
  booker_phone: string | null;
  booker_email: string | null;
  examiner_name: string | null;
  examiner_phone: string | null;
  examiner_email: string | null;
  is_mine_booked: boolean;
  is_mine_assigned: boolean;
}
interface CancelResult {
  session_id: string;
  status: string;
  within_72h: boolean;
  refund_due: boolean;
}
interface SessionCert {
  serial: string;
  candidate_name: string;
  level: string;
  billing_stage: string;
  issued_on: string | null;
}
interface AuditEvent {
  id: string;
  actor_name: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'active' | 'awaiting_pickup' | 'completed' | 'closed' | 'cancelled' | 'archived' | 'all';

const TERMINAL = new Set(['completed', 'closed', 'cancelled', 'archived']);

// Which statuses fall under each tab.
const TAB_MATCH: Record<Tab, (s: string) => boolean> = {
  active: (s) => ['awaiting_payment', 'open_for_pickup', 'claimed', 'scheduled', 'requested', 'examiner_invited'].includes(s),
  awaiting_pickup: (s) => s === 'open_for_pickup',
  completed: (s) => s === 'completed',
  closed: (s) => s === 'closed',
  cancelled: (s) => s === 'cancelled',
  archived: (s) => s === 'archived',
  all: () => true,
};
const TAB_LABEL: Record<Tab, string> = {
  active: 'Active',
  awaiting_pickup: 'Awaiting pickup',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
  archived: 'Archived',
  all: 'All',
};
const TAB_ORDER: Tab[] = ['active', 'awaiting_pickup', 'completed', 'closed', 'cancelled', 'archived', 'all'];

function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

const AUDIT_LABEL: Record<string, string> = {
  payment_recorded: 'Payment recorded',
  refund_recorded: 'Refund recorded',
  payout_recorded: 'Payout recorded',
  session_reopened: 'Session reopened',
};
function auditSummary(e: AuditEvent): string {
  const d = e.detail ?? {};
  if (e.action === 'session_reopened') return `Reason: ${String(d.reason ?? '—')}`;
  const parts: string[] = [];
  if (d.amount != null) parts.push(`RM ${Number(d.amount).toFixed(2)}`);
  if (d.method) parts.push(String(d.method));
  if (d.reference) parts.push(`ref ${String(d.reference)}`);
  if (d.note) parts.push(String(d.note));
  return parts.join(' · ');
}
function auditWhen(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function MySessions() {
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  const [confirmRow, setConfirmRow] = useState<TrackerRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<Record<string, CancelResult>>({});
  const [cancelError, setCancelError] = useState<Record<string, string>>({});

  // Per-session certificates, fetched lazily on expand.
  const [certs, setCerts] = useState<Record<string, SessionCert[]>>({});
  const [certLoad, setCertLoad] = useState<Record<string, 'loading' | 'ready' | 'error'>>({});

  // Per-session audit trail (governance only — returns empty for others).
  const [audit, setAudit] = useState<Record<string, AuditEvent[]>>({});

  const fetchCerts = useCallback(async (sessionId: string) => {
    setCertLoad((m) => ({ ...m, [sessionId]: 'loading' }));
    const { data, error } = await supabase.rpc('list_session_certificates', { _session_id: sessionId });
    if (error) {
      setCertLoad((m) => ({ ...m, [sessionId]: 'error' }));
      return;
    }
    setCerts((m) => ({ ...m, [sessionId]: (data ?? []) as SessionCert[] }));
    setCertLoad((m) => ({ ...m, [sessionId]: 'ready' }));
  }, []);

  const fetchAudit = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase.rpc('list_audit_log', { _session_id: sessionId, _limit: 50 });
    if (error) return; // not authorized / no access → leave empty
    setAudit((m) => ({ ...m, [sessionId]: (data ?? []) as AuditEvent[] }));
  }, []);

  function toggleExpand(sessionId: string) {
    setExpanded((cur) => {
      const next = cur === sessionId ? null : sessionId;
      if (next && certs[sessionId] === undefined) fetchCerts(sessionId);
      if (next && audit[sessionId] === undefined) fetchAudit(sessionId);
      return next;
    });
  }

  const fetchSessions = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_session_tracker');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as TrackerRow[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Governance sees rows that are neither booked-by-me nor assigned-to-me → "all sessions".
  const isGovernanceView = useMemo(
    () => rows.some((r) => !r.is_mine_booked && !r.is_mine_assigned),
    [rows],
  );

  const counts = useMemo(() => {
    const c = {} as Record<Tab, number>;
    for (const t of TAB_ORDER) c[t] = rows.filter((r) => TAB_MATCH[t](r.status)).length;
    return c;
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => TAB_MATCH[tab](r.status)), [rows, tab]);

  async function cancelSession(row: TrackerRow) {
    setConfirmRow(null);
    setCancelError((m) => {
      const n = { ...m };
      delete n[row.session_id];
      return n;
    });
    setCancelBusy(row.session_id);
    const { data, error } = await supabase.rpc('cancel_session', { _session_id: row.session_id });
    setCancelBusy(null);
    if (error) {
      setCancelError((m) => ({ ...m, [row.session_id]: error.message }));
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as CancelResult | null;
    if (result) setCancelResult((m) => ({ ...m, [row.session_id]: result }));
    await fetchSessions();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Assessments</p>
        <h1>{isGovernanceView ? 'All sessions' : 'My sessions'}</h1>
        <p className="mas-lede">
          {isGovernanceView
            ? 'Every assessment session, with each one’s progress from creation through to certificates issued. Expand a row for the booker and examiner contacts.'
            : 'The assessment sessions you’re involved in, with each one’s progress from creation through to certificates issued. Expand a row for contacts and to cancel a session you booked.'}
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchSessions} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {TAB_ORDER.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]} ({counts[t]})
            </button>
          ))}
        </div>
      </div>

      {load === 'loading' && <p className="mas-status">Loading sessions…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load sessions. Refresh to try again.</p>
      )}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No sessions in this view.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th className="mas-table-expandcol" aria-label="Expand" />
                <th>Venue</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th className="mas-num">Cand.</th>
                <th>Receipt</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isOpen = expanded === row.session_id;
                const result = cancelResult[row.session_id];
                const effectiveStatus = result?.status ?? row.status;
                const canCancel =
                  row.is_mine_booked && !TERMINAL.has(effectiveStatus) && !result;
                const steps = [
                  { key: 'created', label: 'Created', done: row.cp_created },
                  { key: 'roster', label: 'Roster confirmed', done: row.cp_roster },
                  { key: 'paid', label: 'Payment cleared', done: row.cp_paid },
                  { key: 'examiner', label: 'Examiner assigned', done: row.cp_examiner },
                  { key: 'completed', label: 'Completed', done: row.cp_completed },
                  { key: 'certs', label: 'Certificates issued', done: row.cp_certs },
                ];
                return (
                  <Fragment key={row.session_id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-table-expandcol">
                        <button
                          type="button"
                          className="mas-table-expandbtn"
                          onClick={() => toggleExpand(row.session_id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                      </td>
                      <td>
                        <span className="mas-cell-stack">
                          <span className="mas-cell-strong">{row.venue || 'Assessment session'}</span>
                          <span className="mas-cell-sub">
                            {row.state || ''}
                            {row.is_mine_booked ? ' · you booked' : row.is_mine_assigned ? ' · you assess' : ''}
                          </span>
                        </span>
                      </td>
                      <td>{prettyDate(row.scheduled_on)}</td>
                      <td><span className="mas-pill">{statusLabel(effectiveStatus)}</span></td>
                      <td className="mas-num">{row.candidate_count}</td>
                      <td className="mas-cell-strong">{row.receipt_no ?? '—'}</td>
                      <td><CheckpointBar steps={steps} /></td>
                    </tr>

                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={7}>
                          <div className="mas-table-detail mas-session-detail">
                            <div>
                              <h3 className="mas-detail-heading">Booked by</h3>
                              {row.booker_name ? (
                                <ul className="mas-detail-list">
                                  <li><strong>{row.booker_name}</strong></li>
                                  {row.booker_phone && <li><a href={`tel:${row.booker_phone}`}>{row.booker_phone}</a></li>}
                                  {row.booker_email && <li><a href={`mailto:${row.booker_email}`}>{row.booker_email}</a></li>}
                                </ul>
                              ) : (
                                <p className="mas-status">—</p>
                              )}
                            </div>

                            <div>
                              <h3 className="mas-detail-heading">Examiner</h3>
                              {row.cp_examiner ? (
                                <ul className="mas-detail-list">
                                  <li><strong>{row.examiner_name || 'Assigned examiner'}</strong></li>
                                  {row.examiner_phone && <li><a href={`tel:${row.examiner_phone}`}>{row.examiner_phone}</a></li>}
                                  {row.examiner_email && <li><a href={`mailto:${row.examiner_email}`}>{row.examiner_email}</a></li>}
                                </ul>
                              ) : (
                                <p className="mas-status">Awaiting examiner pickup.</p>
                              )}
                            </div>

                            <div>
                              <h3 className="mas-detail-heading">Certificates</h3>
                              {certLoad[row.session_id] === 'loading' && (
                                <p className="mas-status">Loading…</p>
                              )}
                              {certLoad[row.session_id] === 'error' && (
                                <p className="mas-status mas-status-bad">Couldn’t load certificates.</p>
                              )}
                              {certLoad[row.session_id] === 'ready' &&
                                (certs[row.session_id]?.length ?? 0) === 0 && (
                                  <p className="mas-status">
                                    Certificates release once grading is complete and payment is cleared.
                                  </p>
                                )}
                              {certLoad[row.session_id] === 'ready' &&
                                (certs[row.session_id]?.length ?? 0) > 0 && (
                                  <ul className="mas-detail-list">
                                    {certs[row.session_id].map((ct) => (
                                      <li key={ct.serial}>
                                        <strong>{ct.candidate_name}</strong> · {pretty(ct.level)}{' '}
                                        <a
                                          href={`/certificate/${ct.serial}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          {ct.serial}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                            </div>

                            {row.is_mine_booked && (
                              <div>
                                <h3 className="mas-detail-heading">Cancel session</h3>
                                {canCancel ? (
                                  <button
                                    className="mas-btn-ghost"
                                    onClick={() => setConfirmRow(row)}
                                    disabled={cancelBusy === row.session_id}
                                  >
                                    {cancelBusy === row.session_id ? 'Cancelling…' : 'Cancel session'}
                                  </button>
                                ) : (
                                  <p className="mas-status">
                                    {result ? 'This session has been cancelled.' : 'This session can no longer be cancelled.'}
                                  </p>
                                )}
                                {result && (
                                  <p className="mas-status mas-status-good mas-admin-rowerror">
                                    Session cancelled.{' '}
                                    {result.refund_due
                                      ? 'A refund will be arranged by the MAS office.'
                                      : result.within_72h
                                        ? 'Within 72 hours of the session — the fee is non-refundable.'
                                        : 'No payment had been made, so the invoice has been voided.'}
                                  </p>
                                )}
                                {cancelError[row.session_id] && (
                                  <p className="mas-status mas-status-bad mas-admin-rowerror">
                                    Couldn’t cancel this session: {cancelError[row.session_id]}
                                  </p>
                                )}
                              </div>
                            )}
                            {(audit[row.session_id]?.length ?? 0) > 0 && (
                              <div>
                                <h3 className="mas-detail-heading">Activity</h3>
                                <ul className="mas-detail-list">
                                  {audit[row.session_id].map((e) => (
                                    <li key={e.id}>
                                      <strong>{AUDIT_LABEL[e.action] ?? e.action}</strong>
                                      {auditSummary(e) ? ` · ${auditSummary(e)}` : ''}
                                      <span className="mas-cell-sub">
                                        {' · '}{e.actor_name || '—'}{' · '}{auditWhen(e.created_at)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
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

      {confirmRow && (
        <div
          className="mas-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-cancel-title"
          onClick={() => setConfirmRow(null)}
        >
          <div className="mas-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-cancel-title" className="mas-modal-title">Cancel this session?</h2>
            <p className="mas-modal-body">
              {confirmRow.venue || 'Assessment session'} · {prettyDate(confirmRow.scheduled_on)}
            </p>
            <p className="mas-modal-body">
              If the assessment is more than 72 hours away and payment was made, a refund
              will be arranged by the MAS office. Within 72 hours the fee is non-refundable.
              If an examiner has picked up the session, please contact them.
            </p>
            <div className="mas-modal-actions">
              <button className="mas-btn-ghost" onClick={() => setConfirmRow(null)}>Keep session</button>
              <button className="mas-btn-primary" onClick={() => cancelSession(confirmRow)}>
                Cancel session
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
