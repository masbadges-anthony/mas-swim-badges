import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/dashboard');
  }

  return (
    <section className="mas-page mas-page-narrow">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Staff & partners</p>
        <h1>Sign in</h1>
        <p className="mas-lede">Access depends on the role granted to your account.</p>
      </header>

      <div className="mas-form">
        <label className="mas-field">
          <span className="mas-field-label">Email</span>
          <input
            className="mas-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="mas-field">
          <span className="mas-field-label">Password</span>
          <input
            className="mas-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mas-status mas-status-bad">{error}</p>}

        <button className="mas-btn" onClick={submit} disabled={busy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </section>
  );
}
