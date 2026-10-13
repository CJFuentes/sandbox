import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from './useAuth';

/** Renders its children for a signed-in user; a signed-out visit redirects to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'checking') return <p className="status">Loading…</p>;
  if (state.status === 'signed-out') return <Navigate to="/login" replace />;
  return children;
}
