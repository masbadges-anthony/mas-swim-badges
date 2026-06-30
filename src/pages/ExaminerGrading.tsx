import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

// Examiner grading — dense table with expandable per-candidate grading rows.
// Reads via list_my_grading_roster(); writes via mark_attendance /
// record_assessment_outcome / submit_session_results.
// FIREWALL: no fee/invoice/payment value anywhere on this screen.
// LOCK: once a session is submitted (completed/closed/archived/cancelled) it renders
// view-only — the server refuses writes; the UI hides the controls.

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
function attendanceLabel(a: Attendance): string {
  return ATTENDANCE.find((x) => x.value === a)?.label ?? a;
}

// Levels the examiner can act on: every passed level (correctable) plus the first
// not-yet-passed level. Stops at a refer or ungraded level. Mirrors the server no-skip rule.
function gradeableChain(row: RosterRow): string[] {
  const recorded = new Map(row.levels.map((l) => [l.level, l.outcome]));
  const chain: string[] = [];
  let i = Math.max(0, levelIndex(row.booked_level));
  while (i < LEVELS.length) {
    const value = LEVELS[i].value;
    chain.push(value);
    if (recorded.get(value) === 'pass') {
      i += 1;
      continue;
    }
    break;
  }
  return chain;
}

const TABLE_CSS = `
.mas-gwrap { overflow-x: auto; border: 1px solid var(--border, #e3e7ee); border-radius: 12px; }
.mas-gtable { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.mas-gtable thead th {
  text-align: left; padding: 0.55rem 0.7rem; background: #1E2752; color: #fff;
  font-size: 0.74rem; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
}
.mas-gtable tbody td { padding: 0.45rem 0.7rem; border-top: 1px solid var(--border, #e3e7ee); vertical-align: middle; }
.mas-grow:hover { background: #f6f8fc; }
.mas-grow.is-open { background: #eef2f8; }
.mas-gname { font-weight: 600; color: var(--navy, #1E2752); }
.mas-gpill { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; background: #1E2752; color: #fff; font-size: 0.72rem; }
.mas-gsel { font: inherit; padding: 0.3rem 0.45rem; border: 1px solid var(--border, #e3e7ee); border-radius: 6px; background: #fff; max-width: 9rem; }
.mas-gout { font-size: 0.74rem; font-weight: 600; margin-right: 0.5rem; white-space: nowrap; }
.mas-gout.is-pass { color: var(--ok, #1a7f4b); }
.mas-gout.is-refer { color: var(--warn, #b4690e); }
.mas-gexpand { cursor: pointer; border: 1px solid var(--border, #e3e7ee); background: #fff; color: #1E2752; border-radius: 6px; padding: 0.3rem 0.6rem; font: inherit; font-weight: 600; white-space: nowrap; }
.mas-gdetail td { background: #f9fafc; padding: 0.6rem 0.9rem 0.9rem; }
.mas-glevel { display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0; flex-wrap: wrap; }
.mas-glevel-name { min-width: 11rem; font-size: 0.88rem; }
.mas-gactions { display: flex; gap: 0.4rem; }
.mas-gnote { margin-top: 0.5rem; }
.mas-gnote input { font: inherit; width: 100%; max-width: 26rem; padding: 0.4rem 0.55rem; border: 1px solid var(--border, #e3e7ee); border-radius: 6px; }
@media (max-width: 640px) { .mas-glevel-name { min-width: 7rem; } .mas-gsel { max-width: 7rem; } }
`;

export default function ExaminerGrading() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [sessionError, setSessionError] = useState<Record<string, string>>({});

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

  const groups = useMemo(() => {
    const map = new Map<string, { row: RosterRow; enrolments: RosterRow[] }>();
    for (const r of rows) {
      if (!map.has(r.session_id)) map.set(r.session_id, { row: r, enrolments: [] });
      map.get(r.session_id)!.enrolments.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  function toggle(id: string) {
    setExpanded((m) => ({ ...m, [id]: !m[id] }));
  }
  function clearRowError(id: string) {
    setRowError((m) => {
      const n = { ...m };
      delete n[id];
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
    await fetchRoster();
  }

  return (
    <section className="mas-page">
      <style>{TABLE_CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Examiner</p>
        <h1>Grading</h1>
        <p className="mas-lede">
          Mark attendance and grade each candidate. Open a row to grade the booked level;
          a pass reveals the next level on the pathway. Submit a session when done — once
          submitted, it locks to view-only.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchRoster} disabled={load === 'loading'}>
          Refresh
        </button>
      </div>

      {load === 'loading' && <p className="mas-status">Loading roster…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load your roster. Refresh to try again.</p>
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
                  Results submitted — this session is view-only. Track payment and certificate
                  release from your dashboard.
                </p>
              )}

              <div className="mas-gwrap">
                <table className="mas-gtable">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Booked</th>
                      <th>Attendance</th>
                      <th>Outcomes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolments.map((r) => {
                      const isOpen = !!expanded[r.enrolment_id];
                      const chain = gradeableChain(r);
                      const recorded = new Map(r.levels.map((l) => [l.level, l.outcome]));
                      const shownLevels = locked ? r.levels.map((l) => l.level) : chain;
                      return (
                        <Fragment key={r.enrolment_id}>
                          <tr className={`mas-grow${isOpen ? ' is-open' : ''}`}>
                            <td className="mas-gname">{r.candidate_name}</td>
                            <td><span className="mas-gpill">{levelLabel(r.booked_level)}</span></td>
                            <td>
                              {locked ? (
                                attendanceLabel(r.attendance)
                              ) : (
                                <select
                                  className="mas-gsel"
                                  value={r.attendance}
                                  disabled={busyKey === `att:${r.enrolment_id}`}
                                  onChange={(e) => setAttendance(r, e.target.value as Attendance)}
                                  aria-label={`Attendance for ${r.candidate_name}`}
                                >
                                  {ATTENDANCE.map((a) => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              {r.levels.length === 0 ? (
                                <span className="mas-admin-sub">—</span>
                              ) : (
                                r.levels.map((l) => (
                                  <span
                                    key={l.level}
                                    className={`mas-gout ${l.outcome === 'pass' ? 'is-pass' : 'is-refer'}`}
                                  >
                                    {levelLabel(l.level)} {l.outcome === 'pass' ? '✓' : '✗'}
                                  </span>
                                ))
                              )}
                            </td>
                            <td>
                              <button className="mas-gexpand" onClick={() => toggle(r.enrolment_id)}>
                                {isOpen ? 'Close' : locked ? 'View' : 'Grade'}
                              </button>
                            </td>
                          </tr>

                          {isOpen && (
                            <tr className="mas-gdetail">
                              <td colSpan={5}>
                                {shownLevels.length === 0 && (
                                  <p className="mas-admin-sub">No outcomes recorded.</p>
                                )}
                                {shownLevels.map((level) => {
                                  const outcome = recorded.get(level) ?? null;
                                  const gradeKey = `grade:${r.enrolment_id}:${level}`;
                                  return (
                                    <div key={level} className="mas-glevel">
                                      <span className="mas-glevel-name">
                                        {levelLabel(level)}
                                        {level === r.booked_level ? ' · booked' : ' · bonus'}
                                      </span>
                                      {outcome && (
                                        <span className={`mas-gout ${outcome === 'pass' ? 'is-pass' : 'is-refer'}`}>
                                          {outcome === 'pass' ? 'Passed' : 'Referred'}
                                        </span>
                                      )}
                                      {!locked && (
                                        <div className="mas-gactions">
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

                                {!locked && (
                                  <div className="mas-gnote">
                                    <input
                                      type="text"
                                      value={notes[r.enrolment_id] ?? ''}
                                      onChange={(e) =>
                                        setNotes((m) => ({ ...m, [r.enrolment_id]: e.target.value }))
                                      }
                                      placeholder="Notes (optional) — recorded with the next outcome you save"
                                    />
                                  </div>
                                )}
                                {rowError[r.enrolment_id] && (
                                  <p className="mas-status mas-status-bad" style={{ marginTop: '0.5rem' }}>
                                    Couldn’t save: {rowError[r.enrolment_id]}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!locked && (
                <div className="mas-form-actions mas-grade-submit" style={{ marginTop: '0.75rem' }}>
                  <button
                    className="mas-btn-primary"
                    onClick={() => submitSession(head.session_id)}
                    disabled={busyKey === `submit:${head.session_id}`}
                  >
                    {busyKey === `submit:${head.session_id}` ? 'Submitting…' : 'Submit results'}
                  </button>
                </div>
              )}
              {sessionError[head.session_id] && (
                <p className="mas-status mas-status-bad">Couldn’t submit: {sessionError[head.session_id]}</p>
              )}
            </div>
          );
        })}
    </section>
  );
}
