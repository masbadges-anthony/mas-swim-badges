import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

// Examiner grading, rebuilt on the function-based assessment flow. The screen never
// touches assessment_results directly: it reads through list_my_grading_roster() (the
// examiner-safe view of session_enrolments — billing fields excluded) and writes through
// mark_attendance / record_assessment_outcome / submit_session_results.
//
// FIREWALL: no fee, invoice, or payment value appears anywhere on this screen.
// LOCK: once a session is submitted (status completed/closed/archived/cancelled), that
// session renders view-only — the server refuses writes, and the UI hides the controls.

const LEVELS: { value: string; label: string }[] = [
  { value: 'starfish', label: 'Starfish' },
  { value: 'sea_turtle', label: 'Sea Turtle' },
  { value: 'guppy', label: 'Guppy' },
  { value: 'octopus', label: 'Octopus' },
  { value: 'frog', label: 'Frog' },
  { value: 'swordfish', label: 'Swordfish' },
  { value: 'dolphin', label: 'Dolphin' },
];

const ATTENDANCE: { value: Attendance; label: string }[] = [
  { value: 'registered', label: 'Registered' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'no_show', label: 'No show' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

// A session at or past this status is locked for grading.
const LOCKED_STATUSES = ['completed', 'closed', 'archived', 'cancelled'];

type Attendance = 'registered' | 'present' | 'absent' | 'no_show' | 'withdrawn';
type Outcome = 'pass' | 'refer';
type Load = 'loading' | 'ready' | 'error';

interface LevelResult {
  level: string;
  outcome: Outcome | null;
  stage: string | null;
}
interface RosterRow {
  session_id: string;
  venue: string | null;
  scheduled_on: string | null;
  session_status: string;
  enrolment_id: string;
  candidate_name: string;
  booked_level: string;
  attendance: Attendance;
  levels: LevelResult[];
}

function levelLabel(value: string): string {
  return LEVELS.find((l) => l.value === value)?.label ?? value;
}

function levelIndex(value: string): number {
  return LEVELS.findIndex((l) => l.value === value);
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The chain of levels an examiner can act on for an enrolment: every passed level (so it
// can be corrected) plus the first not-yet-passed level. Revealing stops at a refer or an
// ungraded level — the server enforces the same no-skip rule, this just mirrors it in UI.
function gradeableChain(row: RosterRow): string[] {
  const recorded = new Map(row.levels.map((l) => [l.level, l.outcome]));
  const chain: string[] = [];
  let i = Math.max(0, levelIndex(row.booked_level));
  while (i < LEVELS.length) {
    const value = LEVELS[i].value;
    chain.push(value);
    if (recorded.get(value) === 'pass') {
      i += 1; // a pass reveals the next level up
      continue;
    }
    break; // ungraded or referred — go no further
  }
  return chain;
}

export default function ExaminerGrading() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [sessionError, setSessionError] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const fetchRoster = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_my_grading_roster');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as RosterRow[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Group enrolments under their session, preserving the RPC's ordering.
  const groups = useMemo(() => {
    const map = new Map<string, { row: RosterRow; enrolments: RosterRow[] }>();
    for (const r of rows) {
      if (!map.has(r.session_id)) map.set(r.session_id, { row: r, enrolments: [] });
      map.get(r.session_id)!.enrolments.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  function clearRowError(enrolmentId: string) {
    setRowError((m) => {
      const n = { ...m };
      delete n[enrolmentId];
      return n;
    });
  }

  async function setAttendance(row: RosterRow, attendance: Attendance) {
    const key = `att:${row.enrolment_id}`;
    setBusyKey(key);
    clearRowError(row.enrolment_id);
    const { error } = await supabase.rpc('mark_attendance', {
      _enrolment_id: row.enrolment_id,
      _attendance: attendance,
    });
    setBusyKey(null);
    if (error) {
      setRowError((m) => ({ ...m, [row.enrolment_id]: error.message }));
      return;
    }
    setRows((list) =>
      list.map((x) => (x.enrolment_id === row.enrolment_id ? { ...x, attendance } : x)),
    );
  }

  async function grade(row: RosterRow, level: string, outcome: Outcome) {
    const key = `grade:${row.enrolment_id}:${level}`;
    setBusyKey(key);
    clearRowError(row.enrolment_id);
    const note = notes[row.enrolment_id]?.trim();
    const { error } = await supabase.rpc('record_assessment_outcome', {
      _enrolment_id: row.enrolment_id,
      _level: level,
      _outcome: outcome,
      _notes: note || null,
    });
    setBusyKey(null);
    if (error) {
      setRowError((m) => ({ ...m, [row.enrolment_id]: error.message }));
      return;
    }
    await fetchRoster();
  }

  async function submitSession(sessionId: string) {
    if (!window.confirm('Submit results for this session? This marks it completed and locks grading.')) return;
    const key = `submit:${sessionId}`;
    setBusyKey(key);
    setSessionError((m) => {
      const n = { ...m };
      delete n[sessionId];
      return n;
    });
    const { error } = await supabase.rpc('submit_session_results', { _session_id: sessionId });
    setBusyKey(null);
    if (error) {
      setSessionError((m) => ({ ...m, [sessionId]: error.message }));
      return;
    }
    setSubmitted((m) => ({ ...m, [sessionId]: true }));
    await fetchRoster();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Examiner</p>
        <h1>Grading</h1>
        <p className="mas-lede">
          Mark attendance and record outcomes for the candidates assigned to you. Grade the
          booked level first; a pass reveals the next level on the pathway. Submit each
          session’s results when you’re done — once submitted, the session is locked.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchRoster} disabled={load === 'loading'}>
          Refresh
        </button>
      </div>

      {load === 'loading' && <p className="mas-status">Loading roster…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">
          Couldn’t load your roster. Refresh to try again.
        </p>
      )}
      {load === 'ready' && groups.length === 0 && (
        <p className="mas-status">You have no sessions assigned to assess.</p>
      )}

      {load === 'ready' &&
        groups.map(({ row: head, enrolments }) => {
          const locked = LOCKED_STATUSES.includes(head.session_status);
          return (
            <div key={head.session_id} className="mas-grade-session">
              <div className="mas-grade-session-head">
                <h2 className="mas-admin-name">{head.venue || 'Assessment session'}</h2>
                <p className="mas-admin-sub">
                  {formatDate(head.scheduled_on) || 'Date TBC'}
                  {head.session_status ? ` · ${head.session_status.replace(/_/g, ' ')}` : ''}
                  {` · ${enrolments.length} candidate${enrolments.length === 1 ? '' : 's'}`}
                </p>
              </div>

              {locked && (
                <p className="mas-status mas-status-good">
                  Results submitted — this session is view-only. Track payment and
                  certificate release from your dashboard.
                </p>
              )}

              <ul className="mas-admin-list">
                {enrolments.map((r) => {
                  const chain = gradeableChain(r);
                  const recorded = new Map(r.levels.map((l) => [l.level, l.outcome]));
                  return (
                    <li key={r.enrolment_id} className="mas-admin-row mas-grade-candidate">
                      <div className="mas-admin-main">
                        <h3 className="mas-admin-name">{r.candidate_name}</h3>
                        <p className="mas-admin-meta">
                          <span className="mas-pill">Booked: {levelLabel(r.booked_level)}</span>
                        </p>

                        <div className="mas-field mas-grade-field">
                          <label
                            className="mas-field-label"
                            htmlFor={`att-${r.enrolment_id}`}
                          >
                            Attendance
                          </label>
                          {locked ? (
                            <p className="mas-admin-sub">
                              {ATTENDANCE.find((a) => a.value === r.attendance)?.label ?? r.attendance}
                            </p>
                          ) : (
                            <select
                              id={`att-${r.enrolment_id}`}
                              className="mas-select"
                              value={r.attendance}
                              disabled={busyKey === `att:${r.enrolment_id}`}
                              onChange={(e) => setAttendance(r, e.target.value as Attendance)}
                            >
                              {ATTENDANCE.map((a) => (
                                <option key={a.value} value={a.value}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="mas-grade-levels">
                          {/* When locked, show every graded level as a static outcome.
                              When open, show the gradeable chain with controls. */}
                          {(locked ? r.levels.map((l) => l.level) : chain).map((level) => {
                            const outcome = recorded.get(level) ?? null;
                            const gradeKey = `grade:${r.enrolment_id}:${level}`;
                            return (
                              <div key={level} className="mas-grade-level">
                                <span className="mas-grade-level-name">
                                  {levelLabel(level)}
                                  {level === r.booked_level ? ' · booked' : ' · bonus'}
                                </span>
                                {outcome && (
                                  <span
                                    className={`mas-outcome ${
                                      outcome === 'pass' ? 'is-pass' : 'is-refer'
                                    }`}
                                  >
                                    {outcome === 'pass' ? 'Passed' : 'Referred'}
                                  </span>
                                )}
                                {!locked && (
                                  <div className="mas-grade-actions">
                                    <button
                                      className="mas-btn-primary"
                                      onClick={() => grade(r, level, 'pass')}
                                      disabled={busyKey === gradeKey}
                                      aria-pressed={outcome === 'pass'}
                                    >
                                      {busyKey === gradeKey ? '…' : 'Pass'}
                                    </button>
                                    <button
                                      className="mas-btn-ghost"
                                      onClick={() => grade(r, level, 'refer')}
                                      disabled={busyKey === gradeKey}
                                      aria-pressed={outcome === 'refer'}
                                    >
                                      Refer
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {locked && r.levels.length === 0 && (
                            <p className="mas-admin-sub">No outcomes recorded.</p>
                          )}
                        </div>

                        {!locked && (
                          <div className="mas-field mas-grade-field">
                            <label
                              className="mas-field-label"
                              htmlFor={`notes-${r.enrolment_id}`}
                            >
                              Notes (optional)
                            </label>
                            <input
                              id={`notes-${r.enrolment_id}`}
                              className="mas-input"
                              type="text"
                              value={notes[r.enrolment_id] ?? ''}
                              onChange={(e) =>
                                setNotes((m) => ({ ...m, [r.enrolment_id]: e.target.value }))
                              }
                              placeholder="Recorded with the next outcome you save"
                            />
                          </div>
                        )}

                        {rowError[r.enrolment_id] && (
                          <p className="mas-status mas-status-bad mas-admin-rowerror">
                            Couldn’t save: {rowError[r.enrolment_id]}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {!locked && (
                <div className="mas-form-actions mas-grade-submit">
                  <button
                    className="mas-btn-primary"
                    onClick={() => submitSession(head.session_id)}
                    disabled={busyKey === `submit:${head.session_id}`}
                  >
                    {busyKey === `submit:${head.session_id}` ? 'Submitting…' : 'Submit results'}
                  </button>
                </div>
              )}
              {submitted[head.session_id] && (
                <p className="mas-status mas-status-good">Results submitted — session completed.</p>
              )}
              {sessionError[head.session_id] && (
                <p className="mas-status mas-status-bad">
                  Couldn’t submit: {sessionError[head.session_id]}
                </p>
              )}
            </div>
          );
        })}
    </section>
  );
}
