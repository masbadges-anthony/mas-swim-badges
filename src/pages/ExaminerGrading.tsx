import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

// Examiner grading, rebuilt on the function-based assessment flow. The screen never
// touches assessment_results directly: it reads through list_my_grading_roster() (the
// examiner-safe view of session_enrolments — billing fields excluded) and writes through
// mark_attendance / record_assessment_outcome / submit_session_results.
//
// FIREWALL: no fee, invoice, or payment value appears anywhere on this screen.
//
// LAYOUT: candidates render as a dense, spreadsheet-style table — one row each — so a
// 50-candidate session stays scannable. The chain-reveal grading controls live in an
// expandable detail row that opens beneath the candidate; the grading logic, RPC calls,
// and no-skip rule are unchanged from the card version.

// Enum order = the no-skip pathway. Values match public.badge_level.
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

// Levels that already carry an outcome, in pathway order — the compact summary a
// collapsed row shows so an examiner can see progress without expanding.
function gradedSoFar(row: RosterRow): LevelResult[] {
  return row.levels
    .filter((l) => l.outcome === 'pass' || l.outcome === 'refer')
    .sort((a, b) => levelIndex(a.level) - levelIndex(b.level));
}

export default function ExaminerGrading() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [sessionError, setSessionError] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null); // one open detail row at a time

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
    // Optimistic local update — attendance doesn't change the levels chain.
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
      // No-skip / COI / authority rejections surface here, in the screen's voice.
      setRowError((m) => ({ ...m, [row.enrolment_id]: error.message }));
      return;
    }
    await fetchRoster(); // re-read so the revealed-next-level chain reflects the server
  }

  async function submitSession(sessionId: string) {
    if (!window.confirm('Submit results for this session? This marks it completed.')) return;
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

  function toggleExpanded(enrolmentId: string) {
    clearRowError(enrolmentId);
    setExpanded((cur) => (cur === enrolmentId ? null : enrolmentId));
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Examiner</p>
        <h1>Grading</h1>
        <p className="mas-lede">
          Mark attendance and record outcomes for the candidates assigned to you. Grade the
          booked level first; a pass reveals the next level on the pathway. Submit each
          session’s results when you’re done.
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
        groups.map(({ row: head, enrolments }) => (
          <div key={head.session_id} className="mas-grade-session">
            <div className="mas-grade-session-head">
              <h2 className="mas-admin-name">{head.venue || 'Assessment session'}</h2>
              <p className="mas-admin-sub">
                {formatDate(head.scheduled_on) || 'Date TBC'}
                {head.session_status ? ` · ${head.session_status.replace(/_/g, ' ')}` : ''}
                {` · ${enrolments.length} candidate${enrolments.length === 1 ? '' : 's'}`}
              </p>
            </div>

            <div className="mas-table-wrap">
              <table className="mas-table mas-grade-table">
                <thead>
                  <tr>
                    <th className="mas-table-expandcol" aria-label="Expand" />
                    <th>Candidate</th>
                    <th>Booked</th>
                    <th>Attendance</th>
                    <th>Outcomes</th>
                    <th className="mas-table-actioncol">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolments.map((r) => {
                    const chain = gradeableChain(r);
                    const recorded = new Map(r.levels.map((l) => [l.level, l.outcome]));
                    const graded = gradedSoFar(r);
                    const isOpen = expanded === r.enrolment_id;
                    return (
                      <Fragment key={r.enrolment_id}>
                        <tr className={`mas-grade-row${isOpen ? ' is-open' : ''}`}>
                          <td className="mas-table-expandcol">
                            <button
                              type="button"
                              className="mas-table-expandbtn"
                              onClick={() => toggleExpanded(r.enrolment_id)}
                              aria-expanded={isOpen}
                              aria-label={isOpen ? 'Collapse grading' : 'Expand grading'}
                            >
                              {isOpen ? '▾' : '▸'}
                            </button>
                          </td>
                          <td className="mas-grade-namecell">{r.candidate_name}</td>
                          <td>
                            <span className="mas-pill">{levelLabel(r.booked_level)}</span>
                          </td>
                          <td>
                            <select
                              id={`att-${r.enrolment_id}`}
                              className="mas-select mas-select-compact"
                              value={r.attendance}
                              disabled={busyKey === `att:${r.enrolment_id}`}
                              aria-label={`Attendance for ${r.candidate_name}`}
                              onChange={(e) => setAttendance(r, e.target.value as Attendance)}
                            >
                              {ATTENDANCE.map((a) => (
                                <option key={a.value} value={a.value}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {graded.length === 0 ? (
                              <span className="mas-grade-summary-empty">—</span>
                            ) : (
                              <span className="mas-grade-summary">
                                {graded.map((l) => (
                                  <span
                                    key={l.level}
                                    className={`mas-summary-pill ${
                                      l.outcome === 'pass' ? 'is-pass' : 'is-refer'
                                    }`}
                                  >
                                    {levelLabel(l.level)} {l.outcome === 'pass' ? '✓' : '— refer'}
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                          <td className="mas-table-actioncol">
                            <button
                              type="button"
                              className="mas-btn-ghost mas-btn-compact"
                              onClick={() => toggleExpanded(r.enrolment_id)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? 'Close' : 'Grade'}
                            </button>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="mas-grade-detail-row">
                            <td colSpan={6}>
                              <div className="mas-grade-detail">
                                <div className="mas-grade-levels">
                                  {chain.map((level) => {
                                    const outcome = recorded.get(level) ?? null;
                                    const gradeKey = `grade:${r.enrolment_id}:${level}`;
                                    return (
                                      <div key={level} className="mas-grade-level">
                                        <span className="mas-grade-level-name">
                                          {levelLabel(level)}
                                          {level === r.booked_level ? ' · booked' : ' · next'}
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
                                      </div>
                                    );
                                  })}
                                </div>

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

                                {rowError[r.enrolment_id] && (
                                  <p className="mas-status mas-status-bad mas-admin-rowerror">
                                    Couldn’t save: {rowError[r.enrolment_id]}
                                  </p>
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

            <div className="mas-form-actions mas-grade-submit">
              <button
                className="mas-btn-primary"
                onClick={() => submitSession(head.session_id)}
                disabled={busyKey === `submit:${head.session_id}`}
              >
                {busyKey === `submit:${head.session_id}` ? 'Submitting…' : 'Submit results'}
              </button>
            </div>
            {submitted[head.session_id] && (
              <p className="mas-status mas-status-good">Results submitted — session completed.</p>
            )}
            {sessionError[head.session_id] && (
              <p className="mas-status mas-status-bad">
                Couldn’t submit: {sessionError[head.session_id]}
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
