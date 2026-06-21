import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Protected({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();

  if (loading) return <p className="mas-status" style={{ padding: '2rem 1.25rem' }}>Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
