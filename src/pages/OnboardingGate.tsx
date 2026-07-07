import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

/**
 * OnboardingGate — wraps the authenticated app. On login, if the user still
 * owes a first-login quiz (server-side needs_onboarding()), it redirects to
 * /onboarding until they pass. Renders children once the check resolves.
 *
 * Placement: wrap your protected routes with it in App.tsx, e.g.
 *   <OnboardingGate><Protected>{appRoutes}</Protected></OnboardingGate>
 * The /onboarding route itself must be reachable (don't gate it, or you loop).
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  // Adapt this line to your useAuth() shape — the guard only needs to know
  // whether someone is signed in. If useAuth returns { session } or { profile },
  // swap `user` accordingly.
  const { user } = useAuth() as { user?: unknown };
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // not signed in, or already on the onboarding route → nothing to gate
    if (!user || location.pathname === '/onboarding') {
      setChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('needs_onboarding');
      if (cancelled) return;
      if (!error && data === true) {
        navigate('/onboarding', { replace: true });
      }
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname, navigate]);

  if (!checked) return null; // swap for your app's loading spinner if you have one
  return <>{children}</>;
}
