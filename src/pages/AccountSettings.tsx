import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

type Load = 'loading' | 'ready' | 'error';

export default function AccountSettings() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [load, setLoad] = useState<Load>('loading');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name, phone')
        .eq('id', me)
        .single();
      if (cancelled) return;
      if (error) {
        setLoad('error');
        return;
      }
      setEmail(data.email ?? '');
      setFullName(data.full_name ?? '');
      setPhone(data.phone ?? '');
      setLoad('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function save() {
    if (!me) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
      .eq('id', me);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <section className="mas-page mas-page-narrow">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Account</p>
        <h1>Your details</h1>
        <p className="mas-lede">
          Update the name and contact number other officers see for you.
        </p>
      </header>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load your profile.</p>
      )}

      {load === 'ready' && (
        <div className="mas-form">
          <div className="mas-field">
            <label className="mas-field-label">Email</label>
            <input className="mas-input" type="email" value={email} disabled />
            <p className="mas-field-note">Managed by your sign-in; can’t be changed here.</p>
          </div>

          <div className="mas-field">
            <label htmlFor="full_name" className="mas-field-label">Full name</label>
            <input
              id="full_name"
              className="mas-input"
              type="text"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="mas-field">
            <label htmlFor="phone" className="mas-field-label">Phone</label>
            <input
              id="phone"
              className="mas-input"
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
              placeholder="e.g. 012-345 6789"
            />
          </div>

          {error && <p className="mas-status mas-status-bad">{error}</p>}
          {saved && <p className="mas-status mas-status-good">Saved.</p>}

          <div className="mas-form-actions">
            <button className="mas-btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
