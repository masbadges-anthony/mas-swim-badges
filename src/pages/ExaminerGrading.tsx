import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

type Outcome = 'pass' | 'refer';

interface CandidateLite {
  id: string;
  full_name: string;
  date_of_birth: string | null;
}
interface SessionLite {
  id: string;
  venue: string | null;
  state: string;
  scheduled_on: string | null;
  status: string;
}
interface ResultRow {
  id: string;
  target_level: string;
  outcome: Outcome | null;
  assessed_on: string | null;
  session_id: string;
  candidate: CandidateLite | null;
  session: SessionLite | null;
}

type Load = 'loading' | 'ready' | 'error';

function todayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function prettyLevel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

export default function ExaminerGrading() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [rows, setRows] = useState<ResultRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchRoster = useCallback(async () => {
    if (!me) return;
    setLoad('loading');
    const { data, error } = await supabase
      .from('assessment_results')
      .select(
        'id, target_level, outcome, assessed_on, session_id, ' +
          'candidate:candidates ( id, full_name, date_of_birth ), ' +
          'session:assessment_sessions ( id, venue, state, scheduled_on, status )',
      )
      .eq('assessor_profile_id', me)
      .order('created_at', { ascending: true });

    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as unknown as ResultRow[]);
    setLoad('ready');
  }, [me]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Viewing the grading queue clears its sidebar attention dot.
  useEffect(() => { void supabase.rpc('mark_attention_seen', { _topic: 'grading' }); }, []);

  // Group roster rows by their session for context.
  const groups = useMemo(() => {
    const map = new Map<string, { session: SessionLite | null; results: ResultRow[] }>();
    for (const r of rows) {
      if (!map.has(r.session_id)) {
        map.set(r.session_id, { session: r.session, results: [] });
      }
      map.get(r.session_id)!.results.push(r);
    }
    return Array.from(map.entries()).map(([id, g]) => ({ id, ...g }));
  }, [rows]);

  const pending = rows.filter((r) => r.outcome === null).length;

  async function setOutcome(r: ResultRow, outcome: Outcome | null) {
    setBusyId(r.id);
    setRowError((m) => {
      const n = { ...m };
      delete n[r.id];
      return n;
    });

    const { data, error } = await supabase
      .from('assessment_results')
      .update({
        outcome,
        assessed_on: outcome ? todayLocal() : null,
      })
      .eq('id', r.id)
      .eq('assessor_profile_id', me) // belt-and-suspenders; RLS enforces this too
      .select('id, outcome, assessed_on')
      .single();

    setBusyId(null);

    if (error) {
      // The COI trigger surfaces here if the assessor instructs this candidate.
      setRowError((m) => ({ ...m, [r.id]: error.message }));
      return;
    }

    setRows((list) =>
      list.map((x) =>
        x.id === r.id
          ? { ...x, outcome: data.outcome as Outcome | null, assessed_on: data.assessed_on }
          : x,
      ),
    );
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Examiner</p>
        <h1>Grading</h1>
        <p className="mas-lede">
          Record outcomes for candidates assigned to you. A pass makes the
          candidate eligible for certificate issuance.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button
          className="mas-btn-ghost"
          onClick={fetchRoster}
          disabled={load === 'loading'}
        >
          Refresh
        </button>
        {load === 'ready' && (
          <span className="mas-admin-count">{pending} to grade</span>
        )}
      </div>

      {load === 'loading' && <p className="mas-status">Loading roster…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">
          Couldn’t load your roster. Refresh to try again.
        </p>
      )}
      {load === 'ready' && groups.length === 0 && (
        <p className="mas-status">You have no candidates assigned to assess.</p>
      )}

      {load === 'ready' &&
        groups.map((g) => (
          <div key={g.id} className="mas-grade-session">
            <div className="mas-grade-session-head">
              <h2 className="mas-admin-name">
                {g.session?.venue || 'Assessment session'}
              </h2>
              <p className="mas-admin-sub">
                {g.session?.state}
                {g.session?.scheduled_on
                  ? ` · ${formatDate(g.session.scheduled_on)}`
                  : ''}
                {g.session?.status ? ` · ${g.session.status}` : ''}
              </p>
            </div>

            <ul className="mas-admin-list">
              {g.results.map((r) => (
                <li key={r.id} className="mas-admin-row">
                  <div className="mas-admin-main">
                    <h3 className="mas-admin-name">
                      {r.candidate?.full_name ?? 'Candidate'}
                    </h3>
                    <p className="mas-admin-meta">
                      <span className="mas-pill">{prettyLevel(r.target_level)}</span>
                      {r.outcome && (
                        <span
                          className={`mas-outcome ${
                            r.outcome === 'pass' ? 'is-pass' : 'is-refer'
                          }`}
                        >
                          {r.outcome === 'pass' ? 'Passed' : 'Referred'}
                          {r.assessed_on ? ` · ${formatDate(r.assessed_on)}` : ''}
                        </span>
                      )}
                    </p>
                    {rowError[r.id] && (
                      <p className="mas-status mas-status-bad mas-admin-rowerror">
                        Couldn’t save: {rowError[r.id]}
                      </p>
                    )}
                  </div>

                  <div className="mas-admin-action mas-grade-actions">
                    {r.outcome === null ? (
                      <>
                        <button
                          className="mas-btn-primary"
                          onClick={() => setOutcome(r, 'pass')}
                          disabled={busyId === r.id}
                        >
                          {busyId === r.id ? '…' : 'Pass'}
                        </button>
                        <button
                          className="mas-btn-ghost"
                          onClick={() => setOutcome(r, 'refer')}
                          disabled={busyId === r.id}
                        >
                          Refer
                        </button>
                      </>
                    ) : (
                      <button
                        className="mas-btn-ghost"
                        onClick={() => setOutcome(r, null)}
                        disabled={busyId === r.id}
                        title="Re-open for re-grading"
                      >
                        Re-open
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
