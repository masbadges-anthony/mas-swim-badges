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

type Load = 'loading' | 'ready' | 'error';

function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function AssessmentsOversight() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [examiners, setExaminers] = useState<Record<string, string>>({});
  const [centres, setCentres] = useState<Record<string, string>>({});
  const [load, setLoad] = useState<Load>('loading');

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const [s, r, ex, ce] = await Promise.all([
      supabase
        .from('assessment_sessions')
        .select('id, venue, state, scheduled_on, status, examiner_profile_id, partner_center_id')
        .order('scheduled_on', { ascending: false }),
      supabase
        .from('assessment_results')
        .select('id, target_level, outcome, assessed_on, session_id, candidate:candidates ( full_name )'),
      supabase.rpc('list_examiners'),
      supabase.from('partner_centers').select('id, name'),
    ]);

    if (s.error || r.error) {
      setLoad('error');
      return;
    }
    setSessions((s.data ?? []) as SessionRow[]);
    setResults((r.data ?? []) as unknown as ResultRow[]);

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

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Assessments oversight</h1>
        <p className="mas-lede">
          Every assessment session and its roster across the programme.
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
            </div>
          );
        })}
    </section>
  );
}
