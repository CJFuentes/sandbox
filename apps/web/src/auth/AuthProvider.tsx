import type { AuthResponse } from '@app/shared';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe } from '../api/auth';
import { clearToken, getToken, setToken } from '../api/client';
import { AuthContext, type AuthState } from './auth-context';

/**
 * Session state. A page that loads with a token in localStorage (`auth.token`) is signed in once
 * GET /auth/me confirms it; if the check fails, the token is removed and the user is signed out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    getToken() === null ? { status: 'signed-out' } : { status: 'checking' },
  );

  useEffect(() => {
    if (state.status !== 'checking') return;
    let cancelled = false;
    getMe().then(
      (user) => {
        if (!cancelled) setState({ status: 'signed-in', user });
      },
      () => {
        if (cancelled) return;
        clearToken();
        setState({ status: 'signed-out' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const signIn = useCallback((response: AuthResponse) => {
    setToken(response.token);
    setState({ status: 'signed-in', user: response.user });
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setState({ status: 'signed-out' });
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
