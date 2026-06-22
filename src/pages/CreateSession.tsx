import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

// The seven badge levels, in pathway order (matches the badge_level enum).
const LEVELS: { value: string; label: string }[] = [
  { value: 'starfish', label: 'Starfish' },
  { value: 'sea_turtle', label: 'Sea Turtle' },
  { value: 'guppy', label: 'Guppy' },
  { value: 'octopus', label: 'Octopus' },
  { value: 'frog', label: 'Frog' },
  { value: 'swordfish', label: 'Swordfish' },
  { value: 'dolphin', label: 'Dolphin' },
];

// New sessions start in 'requested': no examiner yet. An examiner is invited
// and, on accepting, becomes the session's examiner and assessor of the roster.
const SESSION_STATUS = 'requested';

interface CentreOption {
  id: string;
  name: string;
  state: string;
}
interface CandidateOption {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  registered_by_profile_id: string | null;
}
interface InstructorOption {
  profile_id: string;
  full_name: string | null;
  email: string | null;
}
interface StateRow { state: string; }

function todayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function CreateSession() {
  const { session, hasRole } = useAuth();
  const me = session?.user?.id ?? null;
  const isGovernance =
    hasRole('chairperson') || hasRole('board_member') || hasRole('chief_examiner');

  const [centres, setCentres] = useState<CentreOption[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [states, setStates] = useState<string[]>([]);

  const [onBehalfId, setOnBehalfId] = useState('');
  const [centreId, setCentreId] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [venue, setVenue] = useState('');
  const [scheduledOn, setScheduledOn] = useState(todayLocal());
  const [filter, setFilter] = useState('');
  // candidateId -> chosen target level (presence = selected)
  const [picked, setPicked] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ rostered: number; failures: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = await Promise.all([
        supabase.from('partner_center_directory').select('id, name, state').order('name'),
        supabase
          .from('candidates')
          .select('id, full_name, date_of_birth, registered_by_profile_id')
          .eq('status', 'active')
          .order('full_name'),
        supabase.rpc('list_states'),
      ]);
      if (cancelled) return;
      setCentres((base[0].data ?? []) as CentreOption[]);
      setCandidates((base[1].data ?? []) as CandidateOption[]);
      setStates(((base[2].data ?? []) as StateRow[]).map((x) => x.state));

      if (isGovernance) {
        const { data } = await supabase.rpc('list_instructors');
        if (!cancelled) setInstructors((data ?? []) as InstructorOption[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGovernance]);

  // Who the booking is "for". Instructors book in their own name; governance
  // may book on behalf of an instructor, else in their own name.
  const bookerId = isGovernance ? (onBehalfId || me) : me;

  const visibleCandidates = useMemo(() => {
    let list = candidates;
    // When booking on behalf of an instructor, show only that instructor's students.
    if (isGovernance && onBehalfId) {
      list = list.filter((c) => c.registered_by_profile_id === onBehalfId);
    }
    const q = filter.trim().toLowerCase();
    if (q) list = list.filter((c) => c.full_name.toLowerCase().includes(q));
    return list;
  }, [candidates, filter, isGovernance, onBehalfId]);

  const pickedCount = Object.keys(picked).length;
  const canSubmit = !!scheduledOn && pickedCount > 0 && !busy && !!bookerId;

  function onCentreChange(id: string) {
    setCentreId(id);
    const c = centres.find((x) => x.id === id);
    if (c) setStateVal(c.state); // auto-fill state from the chosen centre
  }

  function toggle(id: string) {
    setPicked((p) => {
      const next = { ...p };
      if (next[id]) delete next[id];
      else next[id] = 'starfish';
      return next;
    });
  }
  function setLevel(id: string, level: string) {
    setPicked((p) => ({ ...p, [id]: level }));
  }

  const reset = useCallback(() => {
    setPicked({});
    setVenue('');
  }, []);

  async function submit() {
    if (!canSubmit || !bookerId) return;
    setBusy(true);
    setError(null);
    setSummary(null);

    // 1. Create the session. No examiner yet — it starts 'requested' and an
    //    examiner is invited/assigned separately. requested_by is the instructor
    //    of record (self, or the on-behalf instructor for staff bookings).
    const { data: sess, error: sErr } = await supabase
      .from('assessment_sessions')
      .insert({
        requested_by_profile_id: bookerId,
        partner_center_id: centreId || null,
        state: stateVal || null,
        venue: venue.trim() || null,
        scheduled_on: scheduledOn,
        status: SESSION_STATUS,
      })
      .select('id')
      .single();

    if (sErr || !sess) {
      setBusy(false);
      setError(sErr?.message ?? 'Could not create the session.');
      return;
    }

    // 2. Roster each picked candidate. Assessor stays null until an examiner
    //    accepts the invitation (the COI trigger skips null-assessor rows).
    const failures: string[] = [];
    let rostered = 0;
    for (const [candidateId, level] of Object.entries(picked)) {
      const { error: rErr } = await supabase.from('assessment_results').insert({
        session_id: sess.id,
        candidate_id: candidateId,
        target_level: level,
        assessor_profile_id: null,
        outcome: null,
      });
      if (rErr) {
        const name = candidates.find((c) => c.id === candidateId)?.full_name ?? candidateId;
        failures.push(`${name}: ${rErr.message}`);
      } else {
        rostered++;
      }
    }

    setBusy(false);
    setSummary({ rostered, failures });
    if (rostered > 0) reset();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Booking</p>
        <h1>Schedule an assessment</h1>
        <p className="mas-lede">
          Create a session and roster candidates. The session starts pending —
          an examiner is invited and assigned separately, and becomes the
          assessor once they accept.
        </p>
      </header>

      <div className="mas-form">
        {isGovernance && (
          <div className="mas-field">
            <label htmlFor="onbehalf" className="mas-field-label">Booking instructor</label>
            <select
              id="onbehalf"
              className="mas-select"
              value={onBehalfId}
              onChange={(e) => { setOnBehalfId(e.target.value); setPicked({}); }}
            >
              <option value="">Myself</option>
              {instructors.map((i) => (
                <option key={i.profile_id} value={i.profile_id}>
                  {i.full_name || i.email || i.profile_id}
                </option>
              ))}
            </select>
            <p className="mas-field-note">
              The instructor of record. Choose one to book on their behalf — the
              candidate list then shows that instructor’s students.
            </p>
          </div>
        )}

        <div className="mas-field">
          <label htmlFor="centre" className="mas-field-label">Centre (optional)</label>
          <select
            id="centre"
            className="mas-select"
            value={centreId}
            onChange={(e) => onCentreChange(e.target.value)}
          >
            <option value="">No centre</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.state}</option>
            ))}
          </select>
        </div>

        <div className="mas-field">
          <label htmlFor="state" className="mas-field-label">State</label>
          <select
            id="state"
            className="mas-select"
            value={stateVal}
            onChange={(e) => setStateVal(e.target.value)}
          >
            <option value="">Select a state…</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <p className="mas-field-note">
            Helps match an examiner. Auto-filled from the centre if you pick one.
          </p>
        </div>

        <div className="mas-field">
          <label htmlFor="venue" className="mas-field-label">Venue</label>
          <input
            id="venue"
            className="mas-input"
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. National Aquatic Centre, Bukit Jalil"
          />
        </div>

        <div className="mas-field">
          <label htmlFor="date" className="mas-field-label">Date</label>
          <input
            id="date"
            className="mas-input"
            type="date"
            value={scheduledOn}
            onChange={(e) => setScheduledOn(e.target.value)}
          />
        </div>

        <div className="mas-field">
          <label htmlFor="cand-filter" className="mas-field-label">
            Candidates ({pickedCount} selected)
          </label>
          <input
            id="cand-filter"
            className="mas-input"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name…"
          />
        </div>

        <ul className="mas-roster">
          {visibleCandidates.length === 0 && (
            <li className="mas-status">No candidates match.</li>
          )}
          {visibleCandidates.map((c) => {
            const checked = c.id in picked;
            return (
              <li key={c.id} className="mas-roster-row">
                <label className="mas-checkbox-row mas-roster-name">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                  />
                  <span>{c.full_name}</span>
                </label>
                {checked && (
                  <select
                    className="mas-select mas-roster-level"
                    value={picked[c.id]}
                    onChange={(e) => setLevel(c.id, e.target.value)}
                    aria-label={`Target level for ${c.full_name}`}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>

        {error && <p className="mas-status mas-status-bad">{error}</p>}

        {summary && (
          <div className="mas-issued">
            <p className="mas-status mas-status-good">
              Session created (awaiting examiner) · {summary.rostered} candidate
              {summary.rostered === 1 ? '' : 's'} rostered. An examiner will be
              invited to schedule it.
            </p>
            {summary.failures.map((f, i) => (
              <p key={i} className="mas-status mas-status-bad">{f}</p>
            ))}
          </div>
        )}

        <div className="mas-form-actions">
          <button className="mas-btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create session & roster'}
          </button>
        </div>
      </div>
    </section>
  );
}
