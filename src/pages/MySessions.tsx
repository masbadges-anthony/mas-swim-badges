// Instructor's view of the assessment sessions they booked. Where "My invoices"
// shows the money, this shows each session's lifecycle — a six-step checkpoint
// bar, the assigned examiner's contact once a session is claimed, and a cancel
// action. Verified wired against the backend:
//   list   ← list_my_sessions() → session_id, venue, state, scheduled_on, status,
//            receipt_no, invoice_status, cp_created, cp_roster, cp_paid,
//            cp_examiner, cp_completed, cp_certs, examiner_name, examiner_phone,
//            examiner_email. The six cp_* booleans are the checkpoint signals;
//            examiner contact is null until the session is claimed.
//   cancel ← cancel_session(_session_id) → { session_id, status, within_72h,
//            refund_due }. The backend is the gate — invalid cancellations
//            surface as an inline error.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import CheckpointBar from '../components/CheckpointBar';
import '../styles/admin.css';

interface MySession {
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
  examiner_name: string | null;
  examiner_phone: string | null;
  examiner_email: string | null;
}
interface CancelResult {
  session_id: string;
  status: string;
  within_72h: boolean;
  refund_due: boolean;
}

type Load = 'loading' | 'ready' | 'error';

// Sessions in these terminal states can no longer be cancelled.
const TERMINAL = new Set(['completed', 'closed', 'cancelled']);

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

export default function MySessions() {
  const [rows, setRows] = useState<MySession[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Cancellation state, keyed by session_id.
  const [confirmRow, setConfirmRow] = useState<MySession | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<Record<string, CancelResult>>({});
  const [cancelError, setCancelError] = useState<Record<string, string>>({});

  const fetchSessions = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_my_sessions');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as MySession[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function cancelSession(row: MySession) {
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
        <h1>My sessions</h1>
        <p className="mas-lede">
          The assessment sessions you booked, with each one’s progress from
          creation through to certificates issued. Expand a row to see the
          assigned examiner’s contact and to cancel a session.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchSessions} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && <span className="mas-admin-count">{rows.length} total</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading sessions…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load sessions. Refresh to try again.</p>
      )}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">You haven’t booked any sessions yet.</p>
      )}

      {load === 'ready' && rows.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th className="mas-table-expandcol" aria-label="Expand" />
                <th>Venue</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Receipt</th>
                <th>Invoice</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row.session_id;
                const result = cancelResult[row.session_id];
                const effectiveStatus = result?.status ?? row.status;
                const cancellable = !TERMINAL.has(effectiveStatus) && !result;
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
                          onClick={() =>
                            setExpanded((cur) => (cur === row.session_id ? null : row.session_id))
                          }
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse details' : 'Expand details'}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                      </td>
                      <td>
                        <span className="mas-cell-stack">
                          <span className="mas-cell-strong">{row.venue || 'Assessment session'}</span>
                          {row.state && <span className="mas-cell-sub">{row.state}</span>}
                        </span>
                      </td>
                      <td>{prettyDate(row.scheduled_on)}</td>
                      <td><span className="mas-pill">{statusLabel(effectiveStatus)}</span></td>
                      <td className="mas-cell-strong">{row.receipt_no ?? '—'}</td>
                      <td>{row.invoice_status ? statusLabel(row.invoice_status) : '—'}</td>
                      <td>
                        <CheckpointBar steps={steps} />
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={7}>
                          <div className="mas-table-detail mas-session-detail">
                            <div>
                              <h3 className="mas-detail-heading">Examiner</h3>
                              {row.cp_examiner ? (
                                <ul className="mas-detail-list">
                                  <li><strong>{row.examiner_name || 'Assigned examiner'}</strong></li>
                                  {row.examiner_phone && (
                                    <li>
                                      <a href={`tel:${row.examiner_phone}`}>{row.examiner_phone}</a>
                                    </li>
                                  )}
                                  {row.examiner_email && (
                                    <li>
                                      <a href={`mailto:${row.examiner_email}`}>{row.examiner_email}</a>
                                    </li>
                                  )}
                                </ul>
                              ) : (
                                <p className="mas-status">Awaiting examiner pickup.</p>
                              )}
                            </div>

                            <div>
                              <h3 className="mas-detail-heading">Cancel session</h3>
                              {cancellable ? (
                                <button
                                  className="mas-btn-ghost"
                                  onClick={() => setConfirmRow(row)}
                                  disabled={cancelBusy === row.session_id}
                                >
                                  {cancelBusy === row.session_id ? 'Cancelling…' : 'Cancel session'}
                                </button>
                              ) : (
                                <p className="mas-status">
                                  {result
                                    ? 'This session has been cancelled.'
                                    : 'This session can no longer be cancelled.'}
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
              If the assessment is more than 72 hours away and payment was made, a
              refund will be arranged by the MAS office. Within 72 hours the fee is
              non-refundable. If an examiner has picked up the session, please
              contact them.
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
