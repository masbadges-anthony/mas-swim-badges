import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';

export default function Login() {
  const { signIn, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (session) navigate('/dashboard'); }, [session, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setError(error);
    else navigate('/dashboard');
  }

  async function onForgot() {
    setError(null); setNotice(null);
    if (!email.trim()) { setError('Enter your email above first, then tap Forgot.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) setError(error.message);
    else setNotice('If that email has an account, a reset link is on its way.');
  }

  return (
    <div className="mas-auth">
      <aside className="mas-auth-brand">
        <div className="mas-auth-brand-logo">
          <img src="/mas-logo.png" alt="MAS Swim Badges"
               onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div>
          <p className="mas-auth-eyebrow">National Swim Badge Registry</p>
          <h2 className="mas-auth-headline">One national standard, from Starfish to Dolphin.</h2>
          <p className="mas-auth-sub">
            Register candidates, run independent assessments, and issue verifiable certificates —
            all in one place for Malaysia Aquatics partner centres.
          </p>
          <div className="mas-auth-quote">
            <p>Seven badges. One pathway. Every certificate publicly verifiable.</p>
            <span>The MAS Swim Badges programme</span>
          </div>
        </div>
        <p className="mas-auth-foot">© Malaysia Aquatics · Swim Badges programme</p>
      </aside>

      <main className="mas-auth-main">
        <div className="mas-auth-topbar">
          <Link to="/" className="mas-auth-back"><Icon name="arrowLeft" /> Back to home</Link>
          <span className="mas-auth-alt">New here? <Link to="/signup" className="is-accent">Create account</Link></span>
        </div>

        <form className="mas-auth-form" onSubmit={onSubmit}>
          <h1 className="mas-auth-title">Welcome back</h1>
          <p className="mas-auth-lede">Sign in to the MAS Swim Badges portal to pick up where you left off.</p>

          {error && <div className="mas-auth-error">{error}</div>}
          {notice && <div className="mas-auth-note">{notice}</div>}

          <div className="mas-auth-field">
            <label htmlFor="email">Email</label>
            <span className="mas-input-icon">
              <Icon name="mail" />
              <input id="email" type="email" className="mas-input" autoComplete="email"
                     placeholder="you@example.com" value={email}
                     onChange={(e) => setEmail(e.target.value)} required />
            </span>
          </div>

          <div className="mas-auth-field">
            <div className="mas-auth-row">
              <label htmlFor="password">Password</label>
              <button type="button" className="mas-auth-link" onClick={onForgot}>Forgot?</button>
            </div>
            <span className="mas-input-icon">
              <Icon name="lock" />
              <input id="password" type="password" className="mas-input" autoComplete="current-password"
                     placeholder="••••••••" value={password}
                     onChange={(e) => setPassword(e.target.value)} required />
            </span>
          </div>

          <button type="submit" className="mas-btn-primary mas-auth-submit" disabled={busy}>
            {busy ? <span className="mas-spinner is-sm" /> : <>Sign in <Icon name="arrowRight" /></>}
          </button>
        </form>

        <div style={{ height: '1.5rem' }} />
      </main>
    </div>
  );
}
