// #19 — Parent claim sign-up.
// Public page. Two steps:
//   1) Enter claim code → verify_claim_code(_code) → if valid, show child's
//      first name so parent can visually confirm this is their kid's slip.
//   2) Enter email + password → supabase.auth.signUp(). Supabase emails the
//      parent a confirmation link → click → land on /auth/callback which
//      completes the claim against the now-authenticated session.
//
// The claim code is passed forward via signUp's user_metadata AND stashed in
// localStorage as a fallback (some email clients strip long URLs; the callback
// checks both).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

type Verify = { valid: boolean; reason: string | null; child_first_name: string | null };
type Step = 'code' | 'account' | 'sent';

export default function ClaimSignup() {
  const { session } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<Verify | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signing, setSigning] = useState(false);

  // If already signed in, redirect to the parent dashboard — they should add
  // more claims from there, not from the public sign-up page.
  useEffect(() => {
    if (session) nav('/parent', { replace: true });
  }, [session, nav]);

  async function verify() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setChecking(true); setError(null); setVerified(null);
    const { data, error } = await supabase.rpc('verify_claim_code', { _code: c });
    setChecking(false);
    if (error) { setError(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Verify | null;
    if (!row) { setError('Unexpected response — try again.'); return; }
    setVerified(row);
    if (row.valid) setStep('account');
  }

  async function signup() {
    const em = email.trim().toLowerCase();
    if (!em || password.length < 8) {
      setError('Enter a valid email and a password of at least 8 characters.');
      return;
    }
    setSigning(true); setError(null);

    // Stash the claim code so /auth/callback can complete the claim after email confirmation.
    try { localStorage.setItem('mas_pending_claim_code', code.trim().toUpperCase()); } catch (_e) { /* ignore */ }

    const { error } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { pending_claim_code: code.trim().toUpperCase() },
      },
    });
    setSigning(false);

    if (error) {
      // Common case: an account already exists at this email.
      if (/already registered|already exists|user already/i.test(error.message)) {
        setError('An account already exists for this email. Please sign in and add the claim from your parent dashboard.');
        return;
      }
      setError(error.message);
      return;
    }
    setStep('sent');
  }

  return (
    <main className="mas-app mas-auth">
      <div className="mas-auth-card" style={{ maxWidth: '32rem' }}>
        <img src="/mas-logo.png" alt="MAS Badges" className="mas-auth-logo" />
        <h1 className="mas-auth-title">Claim your child’s badges</h1>

        {step === 'code' && (
          <>
            <p className="mas-auth-lede">
              Enter the claim code from the slip your child’s instructor gave you.
              Once your account is set up, you’ll be able to see their badges and
              track upcoming assessments.
            </p>
            <div className="mas-field">
              <label htmlFor="claim" className="mas-field-label">Claim code</label>
              <input
                id="claim" className="mas-input mas-mono" type="text"
                value={code} autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 2368FE1442"
                onKeyDown={(e) => { if (e.key === 'Enter') verify(); }}
              />
            </div>
            {verified && !verified.valid && (
              <p className="mas-status mas-status-bad" style={{ marginTop: '0.5rem' }}>
                {verified.reason === 'already_claimed'
                  ? 'This code has already been used. If you believe that’s a mistake, contact your child’s centre.'
                  : 'That code isn’t recognised. Check the slip and try again.'}
              </p>
            )}
            {error && <p className="mas-status mas-status-bad">{error}</p>}
            <div className="mas-form-actions" style={{ marginTop: '1rem' }}>
              <button className="mas-btn-primary" onClick={verify} disabled={checking || !code.trim()}>
                {checking ? 'Checking…' : 'Verify code'}
              </button>
            </div>
            <p className="mas-auth-alt">
              Already have an account? <Link to="/login">Sign in</Link>.
            </p>
          </>
        )}

        {step === 'account' && verified?.valid && (
          <>
            <p className="mas-status mas-status-good" style={{ marginTop: 0 }}>
              Code accepted — this slip is for <strong>{verified.child_first_name}</strong>.
            </p>
            <p className="mas-auth-lede">
              Create an account to claim {verified.child_first_name}’s record.
              We’ll send you an email to confirm your address.
            </p>
            <div className="mas-field">
              <label htmlFor="email" className="mas-field-label">Your email</label>
              <input
                id="email" className="mas-input" type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="mas-field">
              <label htmlFor="pw" className="mas-field-label">Password</label>
              <input
                id="pw" className="mas-input" type="password" autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            {error && <p className="mas-status mas-status-bad">{error}</p>}
            <div className="mas-form-actions" style={{ marginTop: '1rem', gap: '0.6rem' }}>
              <button className="mas-btn-primary" onClick={signup} disabled={signing || !email.trim() || password.length < 8}>
                {signing ? 'Creating account…' : 'Create account'}
              </button>
              <button className="mas-btn-ghost" onClick={() => { setStep('code'); setVerified(null); setError(null); }}>
                Use a different code
              </button>
            </div>
          </>
        )}

        {step === 'sent' && (
          <>
            <p className="mas-status mas-status-good" style={{ marginTop: 0 }}>Account created.</p>
            <p className="mas-auth-lede">
              We’ve sent a confirmation email to <strong>{email}</strong>. Click the link
              in that email to finish setting up your account — your child’s badges will
              appear on your parent dashboard right after.
            </p>
            <p className="mas-auth-alt">
              Didn’t get it? Check your spam folder, or <Link to="/login">try signing in</Link> if
              you already confirmed.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
