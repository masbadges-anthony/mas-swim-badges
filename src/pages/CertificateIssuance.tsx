import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

// Payment-gated, per-session certificate issuance. Each session shows two actions
// matching the two billing stages: "booked" (prepay) and "bonus" (reconcile).
// issue_session_certificates(_session_id, _stage) mints one cert per passing,
// not-yet-certified result of that stage and returns the integer count. The
// function RAISES if that stage's invoice is not paid — surfaced inline.

type Stage = 'booked' | 'bonus';

interface SessionLite {
  id: string;
  venue: string | null;
  state: string;
  scheduled_on: string | null;
}
interface AwaitingRow {
  id: string;
  billing_stage: Stage;
  session: SessionLite | null;
}
interface SessionGroup {
  session: SessionLite;
  booked: number;
  bonus: number;
}

type Load = 'loading' | 'ready' | 'error';

function prettyDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CertificateIssuance() {
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busy, setBusy] = useState<string | null>(null); // `${sessionId}:${stage}`
  const [errors, setErrors] = useState<Record<string, string>>({}); // keyed like busy
  const [issuedLog, setIssuedLog] = useState<string[]>([]);

  const fetchAwaiting = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('assessment_results')
      .select(
        'id, billing_stage, ' +
          'session:assessment_sessions ( id, venue, state, scheduled_on )',
      )
      .eq('outcome', 'pass')
      .is('certificate_id', null);

    if (error) {
      setLoad('error');
      return;
    }

    // Group the awaiting passes by session, counting each billing stage.
    const map = new Map<string, SessionGroup>();
    for (const r of (data ?? []) as unknown as AwaitingRow[]) {
      if (!r.session) continue;
      const g = map.get(r.session.id) ?? { session: r.session, booked: 0, bonus: 0 };
      if (r.billing_stage === 'bonus') g.bonus += 1;
      else g.booked += 1;
      map.set(r.session.id, g);
    }
    setGroups([...map.values()]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchAwaiting();
  }, [fetchAwaiting]);

  async function issue(g: SessionGroup, stage: Stage) {
    const key = `${g.session.id}:${stage}`;
    setBusy(key);
    setErrors((m) => {
      const n = { ...m };
      delete n[key];
      return n;
    });

    const { data, error } = await supabase.rpc('issue_session_certificates', {
      _session_id: g.session.id,
      _stage: stage,
    });
    setBusy(null);

    if (error) {
      // Raised when that stage's invoice is not paid (payment gate).
      setErrors((m) => ({ ...m, [key]: error.message }));
      return;
    }

    const count = (data as number) ?? 0;
    const where = g.session.venue || g.session.state || 'session';
    setIssuedLog((l) => [
      `Issued ${count} ${stage} certificate${count === 1 ? '' : 's'} for ${where}.`,
      ...l,
    ]);
    // Issued results gained a certificate_id, so they leave the queue.
    fetchAwaiting();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Issuance</p>
        <h1>Issue certificates</h1>
        <p className="mas-lede">
          Passed candidates awaiting a certificate, grouped by session. Issuing is
          payment-gated: the booked or bonus invoice for that session must be paid
          first. Issuing generates serials and makes the certificates publicly
          verifiable.
        </p>
      </header>

      {issuedLog.length > 0 && (
        <div className="mas-issued">
          {issuedLog.map((t, i) => (
            <p key={i} className="mas-status mas-status-good">
              {t}
            </p>
          ))}
        </div>
      )}

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchAwaiting} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && (
          <span className="mas-admin-count">
            {groups.length} session{groups.length === 1 ? '' : 's'} awaiting
          </span>
        )}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">
          Couldn’t load passes. Refresh to try again.
        </p>
      )}
      {load === 'ready' && groups.length === 0 && (
        <p className="mas-status">No passed candidates are awaiting a certificate.</p>
      )}

      {load === 'ready' &&
        groups.map((g) => {
          const bookedKey = `${g.session.id}:booked`;
          const bonusKey = `${g.session.id}:bonus`;
          return (
            <div key={g.session.id} className="mas-form" style={{ marginBottom: '0.9rem' }}>
              <div className="mas-form-cardhead">
                <div>
                  <h2 style={{ marginTop: 0 }}>{g.session.venue || 'Assessment session'}</h2>
                  <p className="mas-admin-sub">
                    {g.session.state}
                    {g.session.scheduled_on ? ` · ${prettyDate(g.session.scheduled_on)}` : ''}
                  </p>
                </div>
                <span className="mas-field-opt">
                  {g.booked} booked · {g.bonus} bonus
                </span>
              </div>

              <div
                className="mas-form-actions"
                style={{ justifyContent: 'flex-start', gap: '0.6rem', flexWrap: 'wrap' }}
              >
                <button
                  className="mas-btn-primary"
                  disabled={g.booked === 0 || busy === bookedKey}
                  onClick={() => issue(g, 'booked')}
                >
                  {busy === bookedKey
                    ? 'Issuing…'
                    : `Issue booked certificates${g.booked ? ` (${g.booked})` : ''}`}
                </button>
                <button
                  className="mas-btn-primary"
                  disabled={g.bonus === 0 || busy === bonusKey}
                  onClick={() => issue(g, 'bonus')}
                >
                  {busy === bonusKey
                    ? 'Issuing…'
                    : `Issue bonus certificates${g.bonus ? ` (${g.bonus})` : ''}`}
                </button>
              </div>

              {errors[bookedKey] && (
                <p className="mas-status mas-status-bad">Couldn’t issue booked: {errors[bookedKey]}</p>
              )}
              {errors[bonusKey] && (
                <p className="mas-status mas-status-bad">Couldn’t issue bonus: {errors[bonusKey]}</p>
              )}
            </div>
          );
        })}
    </section>
  );
}
