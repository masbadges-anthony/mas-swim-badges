// #19 — Auth callback: handles Supabase's email-confirmation return.
//
// Supabase's confirmation link brings the user back to /auth/callback with the
// session tokens in the URL hash (implicit flow). Our supabase-js client already
// hooks that up automatically on load — we just wait for `session` to arrive.
//
// Once signed in, we check for a pending claim code (from user_metadata OR
// localStorage) and call claim_candidate(_code) to complete the flow. Then we
// route the parent to /parent.
//
// Race handling: if the code was claimed by someone else between sign-up and
// confirmation, we tell the parent clearly and let them still get to /parent
// (with no swimmer yet; they can enter another code from the dashboard).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/auth.css';

type Phase = 'waiting' | 'claiming' | 'done' | 'error';

export default function AuthCallback() {
  const { session, user } = useAuth();
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>('waiting');
  const [message, setMessage] = useState<string>('Finishing your sign-in…');

  useEffect(() => {
    if (!session || !user) return;

    // Branch 1: admin-invited staff. user_metadata carries an invited_role marker
    // set by the admin-create-user Edge Function. Route them to set a password.
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const invitedRole = typeof meta.invited_role === 'string' ? meta.invited_role : null;

    // Branch 2: parent claim — pending code in metadata OR localStorage.
    const metaCode = meta.pending_claim_code;
    const localCode = (() => { try { return localStorage.getItem('mas_pending_claim_code'); } catch (_e) { return null; } })();
    const code = (typeof metaCode === 'string' ? metaCode : null) || localCode || null;

    (async () => {
      if (invitedRole) {
        setPhase('done');
        setMessage('Redirecting to set your password…');
        nav('/set-password', { replace: true });
        return;
      }

      if (!code) {
        // No pending claim — probably a regular sign-in return. Send to dashboard.
        setPhase('done');
        nav('/dashboard', { replace: true });
        return;
      }

      setPhase('claiming');
      setMessage('Linking your child’s record to your account…');

      const { data, error } = await supabase.rpc('claim_candidate', { _code: code });
      // Clear the local stash regardless — one-shot use.
      try { localStorage.removeItem('mas_pending_claim_code'); } catch (_e) { /* ignore */ }

      if (error) {
        setPhase('error');
        setMessage(
          `Your account was created, but we couldn’t link the claim: ${error.message}. ` +
          `You can add a claim code from your dashboard.`,
        );
        setTimeout(() => nav('/parent', { replace: true }), 3500);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setPhase('error');
        setMessage(
          'Your account was created, but the claim code is no longer valid — someone may have used it already. ' +
          'You can add another code from your dashboard.',
        );
        setTimeout(() => nav('/parent', { replace: true }), 3500);
        return;
      }

      setPhase('done');
      nav('/parent', { replace: true });
    })();
  }, [session, user, nav]);

  return (
    <main className="mas-app mas-auth">
      <div className="mas-auth-card" style={{ maxWidth: '28rem', textAlign: 'center' }}>
        <img src="/mas-logo.png" alt="MAS Badges" className="mas-auth-logo" />
        <h1 className="mas-auth-title">One moment…</h1>
        <p className="mas-auth-lede" role="status">{message}</p>
        {phase === 'error' && (
          <p className="mas-status mas-status-bad" style={{ marginTop: '0.6rem' }}>
            Redirecting to your dashboard…
          </p>
        )}
      </div>
    </main>
  );
}
