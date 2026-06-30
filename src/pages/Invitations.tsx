// Examiner self-pickup pool. Examiners are no longer invited to a named session —
// they browse the open (paid) sessions in their state and pick one up. Wired against:
//   list ← list_open_sessions()  (paid sessions in the examiner's state, widened to all
//          states once open_to_all flips 7 days after payment, COI-excluded)
//   pick up ← claim_session(_session_id)  (assigns the caller and schedules the session)
//
// FIREWALL: no fee amount is returned and none is shown — billable status is implicit,
// since only paid sessions ever appear in the pool.
import { useCallback, useEffect, useState } from 'react';
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

  async function pickUp(r: OpenSession) {
    setBusyId(r.session_id);
    setNotice(null);
    setRowError((m) => {
      const n = { ...m };
      delete n[r.session_id];
      return n;
    });

    const { error } = await supabase.rpc('claim_session', { _session_id: r.session_id });

    setBusyId(null);

    if (error) {
      // Already claimed / payment not cleared / outside state / COI all surface here.
      setRowError((m) => ({ ...m, [r.session_id]: error.message }));
      return;
    }

    // On success the session leaves the pool; drop it locally and confirm.
    setRows((list) => list.filter((x) => x.session_id !== r.session_id));
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
        <ul className="mas-admin-list">
          {rows.map((r) => (
            <li key={r.session_id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
              <div className="mas-admin-main">
                <h2 className="mas-admin-name">
                  {r.venue || prettyState(r.state) || 'Assessment session'}
                </h2>
                <p className="mas-admin-meta">
                  <span className="mas-pill">{prettyDate(r.scheduled_on)}</span>
                  <span className="mas-admin-sub">
                    {prettyState(r.state)}
                    {r.state ? ' · ' : ''}
                    {Number(r.candidate_count)} candidate
                    {Number(r.candidate_count) === 1 ? '' : 's'}
                  </span>
                  {r.open_to_all && <span className="mas-pill">Open to all states</span>}
                </p>
                {(r.booker_name || r.booker_phone || r.booker_email || r.centre_name) && (
                  <p className="mas-admin-sub">
                    Booker:{' '}
                    {[
                      r.booker_name,
                      r.centre_name,
                      r.booker_phone,
                      r.booker_email,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {rowError[r.session_id] && (
                  <p className="mas-status mas-status-bad mas-admin-rowerror">
                    {rowError[r.session_id]}
                  </p>
                )}
              </div>
              <div className="mas-admin-action">
                <button
                  className="mas-btn-primary"
                  onClick={() => pickUp(r)}
                  disabled={busyId === r.session_id}
                >
                  {busyId === r.session_id ? 'Working…' : 'Pick up'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {load === 'ready' && notice && (
        <p className="mas-status">
          Picked up a session? Open <Link to="/assessments/grade">Grading</Link> to assess.
        </p>
      )}
    </section>
  );
}
