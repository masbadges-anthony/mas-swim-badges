// Examiner self-pickup pool. Examiners are no longer invited to a named session —
// they browse the open (paid) sessions in their state and pick one up. Wired against:
//   list ← list_open_sessions()  (paid sessions in the examiner's state, widened to all
//          states once open_to_all flips 7 days after payment, COI-excluded)
//   pick up ← claim_session(_session_id, _examiner_remarks)
//     (assigns the caller, schedules the session, and records optional remarks)
//
// Pickup is a two-step: clicking "Pick up" expands an inline confirm row with an
// optional remarks textarea (<=200 chars, visible to instructor+governance only,
// never to parents). "Confirm pickup" fires the RPC.
//
// FIREWALL: no fee amount is returned and none is shown — billable status is implicit,
// since only paid sessions ever appear in the pool.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface OpenSession {
  session_id: string;
  venue: string | null;
  state: string | null;
  scheduled_on: string | null;
  candidate_count: number;
  open_to_all: boolean;
  booker_name: string | null;
  booker_phone: string | null;
  booker_email: string | null;
  centre_name: string | null;
  paid: boolean;
}

type Load = 'loading' | 'ready' | 'error';

const REMARKS_MAX = 200;

function prettyDate(s: string | null): string {
  if (!s) return 'Date to be confirmed';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function prettyState(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function Invitations() {
  const [rows, setRows] = useState<OpenSession[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const fetchPool = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_open_sessions');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as OpenSession[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  function openPickup(sessionId: string) {
    setNotice(null);
    setRowError((m) => {
      const n = { ...m };
      delete n[sessionId];
      return n;
    });
    setExpandedId(sessionId);
  }

  function cancelPickup(sessionId: string) {
    if (busyId === sessionId) return;
    setExpandedId((cur) => (cur === sessionId ? null : cur));
  }

  function setRemark(sessionId: string, value: string) {
    setRemarks((m) => ({ ...m, [sessionId]: value }));
  }

  async function confirmPickup(r: OpenSession) {
    const raw = (remarks[r.session_id] ?? '').trim();
    if (raw.length > REMARKS_MAX) {
      setRowError((m) => ({ ...m, [r.session_id]: `Notes must be ${REMARKS_MAX} characters or fewer.` }));
      return;
    }

    setBusyId(r.session_id);
    setRowError((m) => {
      const n = { ...m };
      delete n[r.session_id];
      return n;
    });

    const { error } = await supabase.rpc('claim_session', {
      _session_id: r.session_id,
      _examiner_remarks: raw || null,
    });

    setBusyId(null);

    if (error) {
      // Already claimed / payment not cleared / outside state / COI all surface here.
      setRowError((m) => ({ ...m, [r.session_id]: error.message }));
      return;
    }

    // On success the session leaves the pool; drop it locally and confirm.
    setRows((list) => list.filter((x) => x.session_id !== r.session_id));
    setRemarks((m) => {
      const n = { ...m };
      delete n[r.session_id];
      return n;
    });
    setExpandedId(null);
    setNotice('Assigned — open Grading to assess.');
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Scheduling</p>
        <h1>Available sessions</h1>
        <p className="mas-lede">
          Paid assessment sessions in your state that need an examiner. Pick one up to
          assign yourself and schedule it — the candidate roster then moves into your
          grading queue. Use the booker contact to coordinate the day.
        </p>
      </header>

      {notice && <p className="mas-status mas-status-good">{notice}</p>}

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchPool} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && <span className="mas-admin-count">{rows.length} available</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load available sessions. Refresh to try again.</p>
      )}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">No sessions are open for pickup right now.</p>
      )}

      {load === 'ready' && rows.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th>Venue</th>
                <th>State</th>
                <th>Date</th>
                <th className="mas-num">Candidates</th>
                <th>Booker contact</th>
                <th>Scope</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const count = Number(r.candidate_count);
                const hasBooker = r.booker_name || r.booker_phone || r.booker_email || r.centre_name;
                const isExpanded = expandedId === r.session_id;
                const isBusy = busyId === r.session_id;
                const remarkVal = remarks[r.session_id] ?? '';
                return (
                  <Fragment key={r.session_id}>
                    <tr>
                      <td className="mas-cell-strong">
                        {r.venue || prettyState(r.state) || 'Assessment session'}
                      </td>
                      <td>{prettyState(r.state) || '—'}</td>
                      <td>{prettyDate(r.scheduled_on)}</td>
                      <td className="mas-num">{count}</td>
                      <td>
                        {hasBooker ? (
                          <span className="mas-cell-stack">
                            {r.booker_name && <span className="mas-cell-strong">{r.booker_name}</span>}
                            {r.centre_name && <span className="mas-cell-sub">{r.centre_name}</span>}
                            {r.booker_phone && <span className="mas-cell-sub">{r.booker_phone}</span>}
                            {r.booker_email && <span className="mas-cell-sub">{r.booker_email}</span>}
                          </span>
                        ) : (
                          <span className="mas-cell-sub">—</span>
                        )}
                      </td>
                      <td>
                        {r.open_to_all ? (
                          <span className="mas-pill">Open to all states</span>
                        ) : (
                          <span className="mas-cell-sub">In-state</span>
                        )}
                      </td>
                      <td className="mas-table-actioncol">
                        {isExpanded ? (
                          <span className="mas-cell-sub">Confirming below…</span>
                        ) : (
                          <button
                            className="mas-btn-primary mas-btn-compact"
                            onClick={() => openPickup(r.session_id)}
                          >
                            Pick up
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7}>
                          <div style={{ display: 'grid', gap: '0.5rem', padding: '0.5rem 0' }}>
                            <label htmlFor={`remarks-${r.session_id}`} className="mas-field-label">
                              Notes for the instructor (optional)
                            </label>
                            <textarea
                              id={`remarks-${r.session_id}`}
                              className="mas-input"
                              rows={3}
                              maxLength={REMARKS_MAX}
                              value={remarkVal}
                              onChange={(e) => setRemark(r.session_id, e.target.value)}
                              placeholder="e.g. Will arrive 15 minutes early; please have the roster printed."
                              disabled={isBusy}
                            />
                            <p className="mas-field-note">
                              Visible to the booking instructor and to governance — not to parents. {remarkVal.length}/{REMARKS_MAX}
                            </p>
                            <div className="mas-form-actions" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <button
                                className="mas-btn-ghost mas-btn-compact"
                                onClick={() => cancelPickup(r.session_id)}
                                disabled={isBusy}
                              >
                                Cancel
                              </button>
                              <button
                                className="mas-btn-primary mas-btn-compact"
                                onClick={() => confirmPickup(r)}
                                disabled={isBusy}
                              >
                                {isBusy ? 'Working…' : 'Confirm pickup'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {rowError[r.session_id] && (
                      <tr className="mas-table-errorrow">
                        <td colSpan={7}>
                          <p className="mas-status mas-status-bad mas-admin-rowerror">
                            {rowError[r.session_id]}
                          </p>
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

      {load === 'ready' && notice && (
        <p className="mas-status">
          Picked up a session? Open <Link to="/assessments/grade">Grading</Link> to assess.
        </p>
      )}
    </section>
  );
}
