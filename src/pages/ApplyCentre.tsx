import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import '../styles/admin.css';

interface StateRow { state: string; }
interface MyCentre {
  id: string;
  name: string;
  state: string;
  status: string;
}

type Load = 'loading' | 'ready' | 'error';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  recognized: 'Recognised',
  suspended: 'Suspended',
  removed: 'Removed',
};

export default function ApplyCentre() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [states, setStates] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [mine, setMine] = useState<MyCentre[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const fetchMine = useCallback(async () => {
    if (!me) return;
    setLoad('loading');
    const { data, error } = await supabase
      .from('partner_centers')
      .select('id, name, state, status')
      .eq('principal_profile_id', me)
      .order('created_at', { ascending: false });
    if (error) {
      setLoad('error');
      return;
    }
    setMine((data ?? []) as MyCentre[]);
    setLoad('ready');
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('list_states');
      if (!cancelled) setStates(((data ?? []) as StateRow[]).map((x) => x.state));
    })();
    fetchMine();
    return () => {
      cancelled = true;
    };
  }, [fetchMine]);

  const canSubmit =
    name.trim().length > 1 && !!state && !!email.trim() && !submitting && !!me;

  function clearForm() {
    setName('');
    setState('');
    setEmail('');
    setPhone('');
    setAddress('');
    setError(null);
    setOk(false);
  }

  async function submit() {
    if (!canSubmit || !me) return;
    setSubmitting(true);
    setError(null);
    setOk(false);

    const { error } = await supabase.from('partner_centers').insert({
      name: name.trim(),
      state,
      contact_email: email.trim(),
      contact_phone: phone.trim() || null,
      address: address.trim() || null,
      principal_profile_id: me,
      status: 'pending',
    });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOk(true);
    setName('');
    setState('');
    setEmail('');
    setPhone('');
    setAddress('');
    fetchMine();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head mas-page-head-row">
        <div>
          <p className="mas-eyebrow">Partner centres</p>
          <h1>Apply for recognition</h1>
          <p className="mas-lede">
            Submit your swim centre for review. Once recognised by Malaysia
            Aquatics, it appears in the public directory.
          </p>
        </div>
        <div className="mas-page-actions">
          <button className="mas-btn-ghost" onClick={clearForm} disabled={submitting}>Clear</button>
          <button className="mas-btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </header>

      <div className="mas-form">
        <div className="mas-form-cardhead">
          <div>
            <p className="mas-eyebrow">Application</p>
            <h2>Centre details</h2>
          </div>
          <span className="mas-badge is-primary">Recognition</span>
        </div>

        <div className="mas-form-grid">
          <div className="mas-field">
            <label htmlFor="name" className="mas-field-label">Centre name <span className="mas-req">*</span></label>
            <input id="name" className="mas-input" type="text" value={name}
              onChange={(e) => { setName(e.target.value); setOk(false); }}
              placeholder="e.g. Splash Aquatics Centre" />
          </div>

          <div className="mas-field">
            <label htmlFor="state" className="mas-field-label">State <span className="mas-req">*</span></label>
            <select id="state" className="mas-select" value={state}
              onChange={(e) => { setState(e.target.value); setOk(false); }}>
              <option value="">Select a state…</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="mas-field">
            <label htmlFor="email" className="mas-field-label">Contact email <span className="mas-req">*</span></label>
            <span className="mas-input-icon">
              <Icon name="mail" />
              <input id="email" className="mas-input" type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setOk(false); }}
                placeholder="centre@example.com" />
            </span>
            <p className="mas-field-note">Used to reach your centre about this application.</p>
          </div>

          <div className="mas-field">
            <label htmlFor="phone" className="mas-field-label">Contact phone <span className="mas-field-opt">(optional)</span></label>
            <input id="phone" className="mas-input" type="tel" value={phone}
              onChange={(e) => { setPhone(e.target.value); setOk(false); }}
              placeholder="e.g. 03-1234 5678" />
          </div>

          <div className="mas-field mas-col-2">
            <label htmlFor="address" className="mas-field-label">Address <span className="mas-field-opt">(optional)</span></label>
            <input id="address" className="mas-input" type="text" value={address}
              onChange={(e) => { setAddress(e.target.value); setOk(false); }}
              placeholder="Street, city, postcode" />
            <p className="mas-field-note">Helps parents find you once you&rsquo;re listed in the directory.</p>
          </div>
        </div>

        {error && <p className="mas-status mas-status-bad">Couldn’t submit: {error}</p>}
        {ok && (
          <p className="mas-status mas-status-good">
            Application submitted. It’s now pending review.
          </p>
        )}
      </div>

      <header className="mas-page-head mas-section-head mas-section-rowhead">
        <h2>Your applications</h2>
        {load === 'ready' && mine.length > 0 && (
          <span className="mas-badge is-primary">{mine.length} total</span>
        )}
      </header>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load your applications.</p>
      )}
      {load === 'ready' && mine.length === 0 && (
        <p className="mas-status">You haven’t applied yet.</p>
      )}
      {load === 'ready' && mine.length > 0 && (
        <ul className="mas-admin-list">
          {mine.map((c) => {
            const recognised = c.status === 'recognized';
            return (
              <li key={c.id} className="mas-admin-row">
                <div className="mas-admin-main">
                  <h3 className="mas-admin-name">{c.name}</h3>
                  <p className="mas-admin-meta">
                    <span className="mas-pill">{c.state}</span>
                    <span className={`mas-outcome ${recognised ? 'is-pass' : 'is-refer'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
