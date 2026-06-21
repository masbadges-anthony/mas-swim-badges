import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// Route guard requiring an active session AND at least one of the given
// membership roles. Session/loading handling mirrors Protected.tsx; this adds
// the role gate so future authenticated modules can reuse it.
//
// IMPORTANT: this is UX only. The real authority is RLS + has_role() in the
// database, which can't be bypassed by editing the front end.
export default function RequireRole({
  roles,
  children,
}: {
  roles: string[];
  children: ReactNode;
}) {
  const { loading, session, hasRole } = useAuth();

  if (loading) {
    return (
      <p className="mas-status" style={{ padding: '2rem 1.25rem' }}>
        Loading…
      </p>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  const allowed = roles.some((r) => hasRole(r));
  if (!allowed) {
    return (
      <section className="mas-page mas-page-narrow">
        <header className="mas-page-head">
          <p className="mas-eyebrow">Restricted</p>
          <h1>No access</h1>
          <p className="mas-lede">
            Your account doesn’t hold a role that can open this screen.
          </p>
        </header>
        <p className="mas-status">
          <Link to="/dashboard">Back to dashboard</Link>
        </p>
      </section>
    );
  }

  return <>{children}</>;
}
