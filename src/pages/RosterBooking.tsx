import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

// Replaces CreateSession. Creates a 'requested' session, then submits the roster
// through submit_roster (which writes the enrolment snapshot + booked result row).
// Existing swimmers are added by pasting Swimmer IDs; new candidates are added as
// rows that mint a Swimmer ID on submit.

const LEVELS: { value: string; label: string }[] = [
  { value: 'starfish', label: 'Starfish' },
  { value: 'sea_turtle', label: 'Sea Turtle' },
  { value: 'guppy', label: 'Guppy' },
  { value: 'octopus', label: 'Octopus' },
  { value: 'frog', label: 'Frog' },
  { value: 'swordfish', label: 'Swordfish' },
  { value: 'dolphin', label: 'Dolphin' },
];

interface CentreOption { id: string; name: string; state: string }
interface InstructorOption { profile_id: string; full_name: string | null; email: string | null }
interface StateRow { state: string }
interface FeeRow { level: string; fee_rm: number }

interface PreviewRow {
  input_id: string;
  found: boolean;
  candidate_id: string | null;
  swimmer_id: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  current_level: string | null;
  next_level: string | null;
  next_fee: number | null;
}

// An existing swimmer, accepted into the working roster (with an editable target).
interface ExistingEntry {
  input_id: string;
  candidate_id: string;
  full_name: string;
  date_of_birth: string | null;
  current_level: string | null;
  attempting: string;
}

interface NewEntry {
  key: string;
  full_name: string;
  date_of_birth: string;
  booked_level: string;
  consent: boolean;
}

interface RosterReport {
  accepted_count: number;
  rejected_count: number;
  accepted: { full_name: string; booked_level: string }[];
  rejected: { full_name: string; swimmer_id: string; reason: string }[];
}

function todayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function prettyLevel(s: string | null): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function nextLevelOf(level: string | null): string {
  if (!level) return 'starfish';
  const i = LEVELS.findIndex((l) => l.value === level);
  if (i < 0) return 'starfish';
  return i + 1 < LEVELS.length ? LEVELS[i + 1].value : level; // Dolphin stays Dolphin
}

export default function RosterBooking() {
  const { session, hasRole } = useAuth();
  const me = session?.user?.id ?? null;
  const isGovernance =
    hasRole('chairperson') || hasRole('board_member') || hasRole('chief_examiner');

  // Reference data
  const [centres, setCentres] = useState<CentreOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [feeMap, setFeeMap] = useState<Record<string, number>>({});

  // Session details
  const [onBehalfId, setOnBehalfId] = useState('');
  const [centreId, setCentreId] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [venue, setVenue] = useState('');
  const [scheduledOn, setScheduledOn] = useState(todayLocal());

  // Roster working set
  const [rawIds, setRawIds] = useState('');
  const [existing, setExisting] = useState<ExistingEntry[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [newRows, setNewRows] = useState<NewEntry[]>([]);

  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RosterReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = await Promise.all([
        supabase.from('partner_center_directory').select('id, name, state').order('name'),
        supabase.rpc('list_states'),
        supabase.from('fee_schedule').select('level, fee_rm'),
      ]);
      if (cancelled) return;
      setCentres((base[0].data ?? []) as CentreOption[]);
      setStates(((base[1].data ?? []) as StateRow[]).map((x) => x.state));
      const fm: Record<string, number> = {};
      ((base[2].data ?? []) as FeeRow[]).forEach((f) => { fm[f.level] = Number(f.fee_rm); });
      setFeeMap(fm);

      if (isGovernance) {
        const { data } = await supabase.rpc('list_instructors');
        if (!cancelled) setInstructors((data ?? []) as InstructorOption[]);
      }
    })();
    return () => { cancelled = true; };
  }, [isGovernance]);

  const bookerId = isGovernance ? (onBehalfId || me) : me;

  function onCentreChange(id: string) {
    setCentreId(id);
    const c = centres.find((x) => x.id === id);
    if (c) setStateVal(c.state);
  }

  async function lookup() {
    const ids = Array.from(
      new Set(rawIds.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)),
    );
    if (ids.length === 0) return;
    setLooking(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('preview_roster_swimmers', { _swimmer_ids: ids });
    setLooking(false);
    if (err) { setError(err.message); return; }

    const rows = (data ?? []) as PreviewRow[];
    const alreadyIn = new Set(existing.map((e) => e.input_id));
    const foundEntries: ExistingEntry[] = [];
    const missing: string[] = [];

    for (const r of rows) {
      if (!r.found || !r.candidate_id) { missing.push(r.input_id); continue; }
      if (alreadyIn.has(r.input_id)) continue; // don't duplicate on a second lookup
      foundEntries.push({
        input_id: r.input_id,
        candidate_id: r.candidate_id,
        full_name: r.full_name ?? r.input_id,
        date_of_birth: r.date_of_birth,
        current_level: r.current_level,
        attempting: r.next_level ?? nextLevelOf(r.current_level),
      });
    }

    setExisting((prev) => [...prev, ...foundEntries]);
    setNotFound(missing);
    setRawIds('');
  }

  function setAttempting(inputId: string, level: string) {
    setExisting((prev) => prev.map((e) => (e.input_id === inputId ? { ...e, attempting: level } : e)));
  }
  function removeExisting(inputId: string) {
    setExisting((prev) => prev.filter((e) => e.input_id !== inputId));
  }

  function addNewRow() {
    setNewRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), full_name: '', date_of_birth: '', booked_level: 'starfish', consent: false },
    ]);
  }
  function patchNewRow(key: string, patch: Partial<NewEntry>) {
    setNewRows((prev) => prev.map((n) => (n.key === key ? { ...n, ...patch } : n)));
  }
  function removeNewRow(key: string) {
    setNewRows((prev) => prev.filter((n) => n.key !== key));
  }

  const validNew = newRows.filter((n) => n.full_name.trim().length >= 2 && n.date_of_birth);
  const rosterCount = existing.length + validNew.length;

  const prepayTotal = useMemo(() => {
    let t = 0;
    for (const e of existing) t += feeMap[e.attempting] ?? 0;
    for (const n of validNew) t += feeMap[n.booked_level] ?? 0;
    return t;
  }, [existing, validNew, feeMap]);

  const canSubmit = !!scheduledOn && !!bookerId && rosterCount > 0 && !busy;

  async function submit() {
    if (!canSubmit || !bookerId) return;
    setBusy(true);
    setError(null);
    setReport(null);

    // 1. Create the session ('requested'; examiner invited/assigned separately).
    const { data: sess, error: sErr } = await supabase
      .from('assessment_sessions')
      .insert({
        requested_by_profile_id: bookerId,
        partner_center_id: centreId || null,
        state: stateVal || null,
        venue: venue.trim() || null,
        scheduled_on: scheduledOn,
        status: 'requested',
      })
      .select('id')
      .single();

    if (sErr || !sess) {
      setBusy(false);
      setError(sErr?.message ?? 'Could not create the session.');
      return;
    }

    // 2. Build the candidate payload and submit the roster in one call.
    const candidates = [
      ...existing.map((e) => ({
        swimmer_id: e.input_id,
        full_name: e.full_name,
        date_of_birth: e.date_of_birth,
        booked_level: e.attempting,
        parental_consent: true, // returning swimmer; consent already on record
      })),
      ...validNew.map((n) => ({
        swimmer_id: null,
        full_name: n.full_name.trim(),
        date_of_birth: n.date_of_birth,
        booked_level: n.booked_level,
        parental_consent: n.consent,
      })),
    ];

    const { data, error: rErr } = await supabase.rpc('submit_roster', {
      _session_id: sess.id,
      _candidates: candidates,
    });

    setBusy(false);
    if (rErr) { setError(rErr.message); return; }

    setReport(data as RosterReport);
    if ((data as RosterReport)?.accepted_count > 0) {
      setExisting([]);
      setNewRows([]);
      setNotFound([]);
    }
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Booking</p>
        <h1>Submit candidates for assessment</h1>
        <p className="mas-lede">
          Create a session and build its roster. Paste Swimmer IDs to add existing
          swimmers — check each name and target level before submitting — or add new
          candidates, who receive a Swimmer ID on submission.
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
              onChange={(e) => setOnBehalfId(e.target.value)}
            >
              <option value="">Myself</option>
              {instructors.map((i) => (
                <option key={i.profile_id} value={i.profile_id}>
                  {i.full_name || i.email || i.profile_id}
                </option>
              ))}
            </select>
            <p className="mas-field-note">The instructor of record — the bill-to for this session.</p>
          </div>
        )}

        <div className="mas-field">
          <label htmlFor="centre" className="mas-field-label">Centre (optional)</label>
          <select id="centre" className="mas-select" value={centreId} onChange={(e) => onCentreChange(e.target.value)}>
            <option value="">No centre</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.state}</option>
            ))}
          </select>
        </div>

        <div className="mas-field">
          <label htmlFor="state" className="mas-field-label">State</label>
          <select id="state" className="mas-select" value={stateVal} onChange={(e) => setStateVal(e.target.value)}>
            <option value="">Select a state…</option>
            {states.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <p className="mas-field-note">Helps match an examiner. Auto-filled from the centre if you pick one.</p>
        </div>

        <div className="mas-field">
          <label htmlFor="venue" className="mas-field-label">Venue</label>
          <input id="venue" className="mas-input" type="text" value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. National Aquatic Centre, Bukit Jalil" />
        </div>

        <div className="mas-field">
          <label htmlFor="date" className="mas-field-label">Date</label>
          <input id="date" className="mas-input" type="date" value={scheduledOn}
            onChange={(e) => setScheduledOn(e.target.value)} />
        </div>

        {/* ---- Paste Swimmer IDs ---- */}
        <div className="mas-field">
          <label htmlFor="ids" className="mas-field-label">Add existing swimmers</label>
          <textarea
            id="ids"
            className="mas-input"
            rows={3}
            value={rawIds}
            onChange={(e) => setRawIds(e.target.value)}
            placeholder="Paste Swimmer IDs — one per line, or separated by spaces/commas (e.g. SW26-HFK7R)"
          />
          <p className="mas-field-note">
            Any valid Swimmer ID may be submitted — a swimmer who moved to you needs no transfer;
            submitting for assessment sets their current instructor and centre.
          </p>
          <div className="mas-form-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="mas-btn-ghost" onClick={lookup} disabled={looking || !rawIds.trim()}>
              {looking ? 'Looking up…' : 'Look up'}
            </button>
          </div>
        </div>

        {notFound.length > 0 && (
          <p className="mas-status mas-status-bad">
            Not found (check the ID): {notFound.join(', ')}
          </p>
        )}

        {/* ---- Working roster ---- */}
        {(existing.length > 0 || newRows.length > 0) && (
          <ul className="mas-admin-list">
            {existing.map((e) => (
              <li key={e.input_id} className="mas-admin-row">
                <div className="mas-admin-main">
                  <h3 className="mas-admin-name">{e.full_name}</h3>
                  <p className="mas-admin-meta">
                    <span className="mas-pill">{e.input_id}</span>
                    <span className="mas-admin-sub">
                      Current: {prettyLevel(e.current_level)} → attempting
                    </span>
                  </p>
                  <div className="mas-admin-meta">
                    <select
                      className="mas-select mas-roster-level"
                      value={e.attempting}
                      onChange={(ev) => setAttempting(e.input_id, ev.target.value)}
                      aria-label={`Target level for ${e.full_name}`}
                    >
                      {LEVELS.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
                    </select>
                    <span className="mas-serial">RM {(feeMap[e.attempting] ?? 0).toFixed(2)}</span>
                  </div>
                </div>
                <div className="mas-admin-action">
                  <button className="mas-btn-ghost" onClick={() => removeExisting(e.input_id)}>Remove</button>
                </div>
              </li>
            ))}

            {newRows.map((n) => (
              <li key={n.key} className="mas-admin-row">
                <div className="mas-admin-main" style={{ display: 'grid', gap: '0.5rem', width: '100%' }}>
                  <h3 className="mas-admin-name">New candidate</h3>
                  <input
                    className="mas-input"
                    type="text"
                    value={n.full_name}
                    onChange={(ev) => patchNewRow(n.key, { full_name: ev.target.value })}
                    placeholder="Full name"
                  />
                  <input
                    className="mas-input"
                    type="date"
                    value={n.date_of_birth}
                    onChange={(ev) => patchNewRow(n.key, { date_of_birth: ev.target.value })}
                    aria-label="Date of birth"
                  />
                  <div className="mas-admin-meta">
                    <select
                      className="mas-select mas-roster-level"
                      value={n.booked_level}
                      onChange={(ev) => patchNewRow(n.key, { booked_level: ev.target.value })}
                      aria-label="Target level"
                    >
                      {LEVELS.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
                    </select>
                    <span className="mas-serial">RM {(feeMap[n.booked_level] ?? 0).toFixed(2)}</span>
                  </div>
                  <label className="mas-checkbox-row">
                    <input
                      type="checkbox"
                      checked={n.consent}
                      onChange={(ev) => patchNewRow(n.key, { consent: ev.target.checked })}
                    />
                    <span>Parental/guardian consent recorded</span>
                  </label>
                </div>
                <div className="mas-admin-action">
                  <button className="mas-btn-ghost" onClick={() => removeNewRow(n.key)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mas-form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="mas-btn-ghost" onClick={addNewRow}>+ Add new candidate</button>
          <span className="mas-admin-count">
            {rosterCount} candidate{rosterCount === 1 ? '' : 's'} · prepay RM {prepayTotal.toFixed(2)}
          </span>
        </div>

        {error && <p className="mas-status mas-status-bad">{error}</p>}

        {report && (
          <div className="mas-issued">
            <p className="mas-status mas-status-good">
              {report.accepted_count} candidate{report.accepted_count === 1 ? '' : 's'} rostered.
              An examiner will be invited to schedule the session.
            </p>
            {report.rejected.map((r, i) => (
              <p key={i} className="mas-status mas-status-bad">
                {r.full_name || r.swimmer_id || 'Row'}: {r.reason}
              </p>
            ))}
          </div>
        )}

        <div className="mas-form-actions">
          <button className="mas-btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Submitting…' : 'Create session & submit roster'}
          </button>
        </div>
      </div>
    </section>
  );
}
