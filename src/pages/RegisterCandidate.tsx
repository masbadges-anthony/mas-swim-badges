import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

// Recognised centre option for the optional affiliation dropdown (read from the
// public directory view, which already lists only recognised centres).
interface CentreOption {
  id: string;
  name: string;
  state: string;
}

// Local shape for the "candidates you've registered" read-back list.
interface MyCandidate {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  partner_center_id: string | null;
  status: string;
  created_at: string;
}

type Load = 'loading' | 'ready' | 'error';

function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
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

export default function RegisterCandidate() {
  const { session } = useAuth();
  // profiles.id == auth.uid() == session.user.id (profiles is 1:1 with auth.users).
  const profileId = session?.user?.id ?? null;

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [centreId, setCentreId] = useState('');
  const [consent, setConsent] = useState(false);

  const [centres, setCentres] = useState<CentreOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const [mine, setMine] = useState<MyCandidate[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const centreName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of centres) map[c.id] = c.name;
    return map;
  }, [centres]);

  // Recognised centres for the optional affiliation dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('partner_center_directory')
        .select('id, name, state')
        .order('name');
      if (!cancelled) setCentres((data ?? []) as CentreOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMine = useCallback(async () => {
    if (!profileId) return;
    setLoad('loading');
    const { data, error } = await supabase
      .from('candidates')
      .select('id, full_name, date_of_birth, partner_center_id, status, created_at')
      .eq('registered_by_profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      setLoad('error');
      return;
    }
    setMine((data ?? []) as MyCandidate[]);
    setLoad('ready');
  }, [profileId]);

  useEffect(() => {
    fetchMine();
  }, [fetchMine]);

  const age = ageFrom(dob);
  const canSubmit =
    fullName.trim().length > 1 && !!dob && consent && !submitting && !!profileId;

  async function submit() {
    if (!canSubmit || !profileId) return;
    setSubmitting(true);
    setFormError(null);
    setJustAdded(null);

    const { data, error } = await supabase
      .from('candidates')
      .insert({
        full_name: fullName.trim(),
        date_of_birth: dob,
        partner_center_id: centreId || null,
        registered_by_profile_id: profileId, // self-stamp — required by RLS
        parental_consent: true,
        consent_recorded_at: new Date().toISOString(),
        consent_recorded_by: profileId,
        // status defaults to 'active' in the DB
      })
      .select('id, full_name, date_of_birth, partner_center_id, status, created_at')
      .single();

    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setMine((list) => [data as MyCandidate, ...list]);
    setJustAdded((data as MyCandidate).full_name);
    // Reset the identity fields; keep the centre selected for quick batch entry.
    setFullName('');
    setDob('');
    setConsent(false);
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Instructor</p>
        <h1>Register a candidate</h1>
        <p className="mas-lede">
          Create a record for a child (typically aged 5–12) you are preparing for
          assessment. Only the minimum identifying details are stored.
        </p>
      </header>

      <div className="mas-form">
        <div className="mas-field">
          <label htmlFor="full_name" className="mas-field-label">
            Child’s full name
          </label>
          <input
            id="full_name"
            className="mas-input"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            placeholder="e.g. Aisha binti Rahman"
          />
        </div>

        <div className="mas-field">
          <label htmlFor="dob" className="mas-field-label">
            Date of birth
          </label>
          <input
            id="dob"
            className="mas-input"
            type="date"
            value={dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDob(e.target.value)}
          />
          {age !== null && (age < 5 || age > 12) && (
            <p className="mas-field-note">
              That’s {age} years old — outside the usual 5–12 range. You can still
              register; eligibility is checked at assessment.
            </p>
          )}
        </div>

        <div className="mas-field">
          <label htmlFor="centre" className="mas-field-label">
            Centre (optional)
          </label>
          <select
            id="centre"
            className="mas-select"
            value={centreId}
            onChange={(e) => setCentreId(e.target.value)}
          >
            <option value="">Independent — no centre</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.state}
              </option>
            ))}
          </select>
        </div>

        <label className="mas-checkbox-row">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            A parent or guardian has given consent for this child to take part in
            the Swim Badges programme and for these details to be recorded.
          </span>
        </label>

        {formError && (
          <p className="mas-status mas-status-bad">
            Couldn’t register this candidate: {formError}
          </p>
        )}
        {justAdded && !formError && (
          <p className="mas-status mas-status-good" role="status">
            “{justAdded}” registered.
          </p>
        )}

        <div className="mas-form-actions">
          <button
            className="mas-btn-primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            {submitting ? 'Registering…' : 'Register candidate'}
          </button>
        </div>
      </div>

      <header className="mas-page-head mas-section-head">
        <h2>Candidates you’ve registered</h2>
      </header>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load your candidates.</p>
      )}
      {load === 'ready' && mine.length === 0 && (
        <p className="mas-status">You haven’t registered any candidates yet.</p>
      )}
      {load === 'ready' && mine.length > 0 && (
        <ul className="mas-admin-list">
          {mine.map((c) => (
            <li key={c.id} className="mas-admin-row">
              <div className="mas-admin-main">
                <h3 className="mas-admin-name">{c.full_name}</h3>
                <p className="mas-admin-meta">
                  {c.status !== 'active' && (
                    <span className="mas-pill">{c.status}</span>
                  )}
                  <span className="mas-admin-sub">
                    Born {formatDate(c.date_of_birth)}
                    {c.partner_center_id
                      ? ` · ${centreName[c.partner_center_id] ?? 'Centre'}`
                      : ' · Independent'}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
