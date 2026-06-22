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
interface Eligible {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  state: string | null;
}

type Load = 'loading' | 'ready' | 'error';

// Sessions still needing an examiner.
const NEEDS_EXAMINER = ['requested', 'examiner_invited'];

function prettyDate(s: string | null): string {
  if (!s) return 'Date to be confirmed';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function InviteExaminer() {
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [eligLoad, setEligLoad] = useState<Load>('loading');

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
    const rows = ((data ?? []) as SessionOverview[]).filter((s) =>
      NEEDS_EXAMINER.includes(s.status),
    );
    setSessions(rows);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const fetchEligible = useCallback(async (sessionId: string) => {
    setEligLoad('loading');
    const { data, error } = await supabase.rpc('list_eligible_examiners', {
      _session_id: sessionId,
    });
    if (error) {
      setEligLoad('error');
      return;
    }
    setEligible((data ?? []) as Eligible[]);
    setEligLoad('ready');
  }, []);

  function select(sessionId: string) {
    setNotice(null);
    setError(null);
    if (selectedId === sessionId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(sessionId);
    fetchEligible(sessionId);
  }

  async function invite(examinerId: string) {
    if (!selectedId) return;
    setBusy(examinerId);
    setNotice(null);
    setError(null);
    const { error } = await supabase.rpc('invite_examiner', {
      _session_id: selectedId,
      _examiner_profile_id: examinerId,
    });
    setBusy(null);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Invitation sent. The examiner will see it in their Invitations inbox.');
    fetchSessions();
    fetchEligible(selectedId);
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Scheduling</p>
        <h1>Invite an examiner</h1>
        <p className="mas-lede">
          Sessions awaiting an examiner. Open one to see examiners with no
          conflict of interest, and invite them — the first to accept is
          assigned and the session is scheduled.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchSessions} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && <span className="mas-admin-count">{sessions.length} awaiting</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load sessions.</p>}
      {load === 'ready' && sessions.length === 0 && (
        <p className="mas-status">No sessions are awaiting an examiner.</p>
      )}

      {load === 'ready' && sessions.length > 0 && (
        <ul className="mas-admin-list">
          {sessions.map((s) => {
            const open = selectedId === s.session_id;
            return (
              <li key={s.session_id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
                <div className="mas-admin-main">
                  <h2 className="mas-admin-name">
                    {s.venue || pretty(s.state) || 'Assessment session'}
                  </h2>
                  <p className="mas-admin-meta">
                    <span className="mas-pill">{prettyDate(s.scheduled_on)}</span>
                    <span className="mas-admin-sub">
                      {pretty(s.state)}
                      {s.state ? ' · ' : ''}
                      {Number(s.candidate_count)} candidate{Number(s.candidate_count) === 1 ? '' : 's'}
                      {s.instructor_name ? ` · ${s.instructor_name}` : ''}
                      {Number(s.invited_count) > 0 ? ` · ${Number(s.invited_count)} invited` : ''}
                    </span>
                  </p>
                </div>
                <div className="mas-admin-action">
                  <button className="mas-btn-ghost" onClick={() => select(s.session_id)}>
                    {open ? 'Close' : 'Invite examiner'}
                  </button>
                </div>

                {open && (
                  <div style={{ flexBasis: '100%', marginTop: '0.75rem' }}>
                    {notice && <p className="mas-status mas-status-good">{notice}</p>}
                    {error && <p className="mas-status mas-status-bad">{error}</p>}

                    {eligLoad === 'loading' && <p className="mas-status">Finding eligible examiners…</p>}
                    {eligLoad === 'error' && (
                      <p className="mas-status mas-status-bad">Couldn’t load examiners.</p>
                    )}
                    {eligLoad === 'ready' && eligible.length === 0 && (
                      <p className="mas-status">
                        No eligible examiners — all active examiners either have a
                        conflict of interest with a candidate here, or none exist yet.
                      </p>
                    )}
                    {eligLoad === 'ready' && eligible.length > 0 && (
                      <ul className="mas-admin-list">
                        {eligible.map((e) => (
                          <li key={e.profile_id} className="mas-admin-row">
                            <div className="mas-admin-main">
                              <h3 className="mas-admin-name">
                                {e.full_name || e.email || e.profile_id}
                              </h3>
                              <p className="mas-admin-meta">
                                <span className="mas-admin-sub">
                                  {pretty(e.state)}
                                  {e.email ? ` · ${e.email}` : ''}
                                </span>
                              </p>
                            </div>
                            <div className="mas-admin-action">
                              <button
                                className="mas-btn-primary"
                                onClick={() => invite(e.profile_id)}
                                disabled={busy === e.profile_id}
                              >
                                {busy === e.profile_id ? 'Inviting…' : 'Invite'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
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
