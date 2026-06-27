import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Invitation {
  invitation_id: string;
  session_id: string;
  status: string;
  venue: string | null;
  scheduled_on: string | null;
  state: string | null;
  candidate_count: number;
  invited_at: string;
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
  const [rows, setRows] = useState<Invitation[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_my_invitations');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as Invitation[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  // Viewing the list clears its sidebar attention dot.
  useEffect(() => { void supabase.rpc('mark_attention_seen', { _topic: 'invitations' }); }, []);

  async function respond(r: Invitation, accept: boolean) {
    setBusyId(r.invitation_id);
    setNotice(null);
    setRowError((m) => {
      const n = { ...m };
      delete n[r.invitation_id];
      return n;
    });

    const { error } = await supabase.rpc('respond_to_invitation', {
      _invitation_id: r.invitation_id,
      _accept: accept,
    });

    setBusyId(null);

    if (error) {
      // COI / not-authorized / already-responded all surface here
      setRowError((m) => ({ ...m, [r.invitation_id]: error.message }));
      return;
    }

    setNotice(
      accept
        ? 'Invitation accepted — the session is now scheduled to you and the roster is yours to grade.'
        : 'Invitation declined.',
    );
    fetchInvites();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Scheduling</p>
        <h1>Examiner invitations</h1>
        <p className="mas-lede">
          Sessions you’ve been invited to assess. Accepting assigns you as the
          examiner and places the candidate roster in your grading queue.
        </p>
      </header>

      {notice && <p className="mas-status mas-status-good">{notice}</p>}

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchInvites} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && <span className="mas-admin-count">{rows.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load invitations. Refresh to try again.</p>
      )}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">You have no open invitations.</p>
      )}

      {load === 'ready' && rows.length > 0 && (
        <ul className="mas-admin-list">
          {rows.map((r) => (
            <li key={r.invitation_id} className="mas-admin-row">
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
                </p>
                {r.status === 'accepted' && (
                  <p className="mas-status mas-status-good mas-admin-rowerror">
                    Accepted — open <Link to="/assessments/grade">Grading</Link> to assess.
                  </p>
                )}
                {rowError[r.invitation_id] && (
                  <p className="mas-status mas-status-bad mas-admin-rowerror">
                    {rowError[r.invitation_id]}
                  </p>
                )}
              </div>
              <div className="mas-admin-action">
                {r.status === 'invited' ? (
                  <>
                    <button
                      className="mas-btn-primary"
                      onClick={() => respond(r, true)}
                      disabled={busyId === r.invitation_id}
                    >
                      {busyId === r.invitation_id ? 'Working…' : 'Accept'}
                    </button>
                    <button
                      className="mas-btn-ghost"
                      onClick={() => respond(r, false)}
                      disabled={busyId === r.invitation_id}
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <span className="mas-pill">{prettyState(r.status)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
