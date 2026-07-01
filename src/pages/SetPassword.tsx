// #18 — Set password: landing page for admin-invited users (email invite) and
// for users who arrived via the "preset password + must_change_password" flag
// set by AccountProvisioning create/set_password (#22).
//
// On successful save this page updates the password AND clears the
// must_change_password metadata flag, so the AppLayout route guard stops
// redirecting them here and they can use the app normally.
//
// Requires a live session (email-invited users arrive already signed-in via the
// invite token; preset-password users arrive signed-in from the login page but
// blocked by the AppLayout guard).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

export default function SetPassword() {
  const { session, user } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // If someone hits /set-password without a session, they're not an invitee.
    // Send them to login.
    if (!session) {
      nav('/login', { replace: true });
    }
  }, [session, nav]);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'there';

  const mustChange = user?.user_metadata?.must_change_password === true;

  const canSave = password.length >= 8 && password === confirm && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setError(null);
    // Merge with existing metadata and clear the must_change_password flag so
    // the AppLayout guard stops redirecting.
    const merged = {
      ...(user?.user_metadata ?? {}),
      must_change_password: false,
    };
    const { error } = await supabase.auth.updateUser({
      password,
      data: merged,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    // Give the user a moment to see the success, then land them on dashboard.
    setTimeout(() => nav('/dashboard', { replace: true }), 1500);
  }

  return (
    <main className="mas-app mas-auth" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem 1rem' }}>
      <div className="mas-auth-card" style={{ maxWidth: '30rem', width: '100%' }}>
        <img src="/mas-logo.png" alt="MAS Badges" className="mas-auth-logo" />
        <h1 className="mas-auth-title">Welcome, {displayName}</h1>
        <p className="mas-auth-lede">
          {mustChange
            ? 'For security, please set a new password before continuing. You’ll use this to log in next time.'
            : 'Your account has been created by MAS Badges. Set a password to finish signing in — you’ll use this to log in next time.'}
        </p>

        {done ? (
          <p className="mas-status mas-status-good" style={{ marginTop: '1rem' }}>
            Password set. Redirecting to your dashboard…
          </p>
        ) : (
          <>
            <div className="mas-field">
              <label htmlFor="pw" className="mas-field-label">New password</label>
              <input
                id="pw" className="mas-input" type="password" autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="mas-field">
              <label htmlFor="pwc" className="mas-field-label">Confirm password</label>
              <input
                id="pwc" className="mas-input" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
              />
            </div>
            {password && confirm && password !== confirm && (
              <p className="mas-cell-sub" style={{ color: 'var(--mas-red,#C62026)' }}>
                Passwords don’t match.
              </p>
            )}
            {error && <p className="mas-status mas-status-bad">{error}</p>}
            <div className="mas-form-actions" style={{ marginTop: '1rem' }}>
              <button className="mas-btn-primary" onClick={save} disabled={!canSave}>
                {busy ? 'Saving…' : 'Set password and continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
