import type { User } from '@app/shared';
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './auth-context';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in user. Use it in pages rendered inside <RequireAuth>. */
export function useCurrentUser(): User {
  const { state } = useAuth();
  if (state.status !== 'signed-in') throw new Error('useCurrentUser needs a signed-in user');
  return state.user;
}
