import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';

export default function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (session) navigate('/dashboard'); }, [session, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null);
    if (!agree) { setError('Please accept the terms and privacy notice to continue.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (data.session) navigate('/dashboard');
    else setNotice('Account created. Check your email to confirm, then sign in.');
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
            Create an account to claim your child&rsquo;s badges, or to access the portal if you&rsquo;ve
            been invited as an instructor, examiner, or centre administrator.
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
          <span className="mas-auth-alt">Already have an account? <Link to="/login" className="is-accent">Sign in</Link></span>
        </div>

        <form className="mas-auth-form" onSubmit={onSubmit}>
          <h1 className="mas-auth-title">Create your account</h1>
          <p className="mas-auth-lede">It takes a minute. You can claim a child&rsquo;s record or accept an invitation afterwards.</p>

          {error && <div className="mas-auth-error">{error}</div>}
          {notice && <div className="mas-auth-note">{notice}</div>}

          <div className="mas-auth-field">
            <label htmlFor="name">Full name</label>
            <input id="name" type="text" className="mas-input" autoComplete="name"
                   placeholder="Your name" value={fullName}
                   onChange={(e) => setFullName(e.target.value)} required />
          </div>

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
            <label htmlFor="password">Password</label>
            <span className="mas-input-icon">
              <Icon name="lock" />
              <input id="password" type="password" className="mas-input" autoComplete="new-password"
                     placeholder="At least 8 characters" value={password}
                     onChange={(e) => setPassword(e.target.value)} required />
            </span>
          </div>

          <label className="mas-auth-check" style={{ marginBottom: '1.1rem' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I agree to the <Link to="/terms" className="mas-auth-link">Terms</Link> and{' '}
            <Link to="/privacy" className="mas-auth-link">Privacy</Link> notice.
          </label>

          <button type="submit" className="mas-btn-primary mas-auth-submit" disabled={busy}>
            {busy ? <span className="mas-spinner is-sm" /> : <>Create account <Icon name="arrowRight" /></>}
          </button>
        </form>

        <div style={{ height: '1.5rem' }} />
      </main>
    </div>
  );
}
