import type { AuthResponse, User } from '@app/shared';
import { createContext } from 'react';

export type AuthState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User };

export interface AuthContextValue {
  state: AuthState;
  /** Stores the token and user after a successful login or registration. */
  signIn: (response: AuthResponse) => void;
  /** Discards the token (logout is client-side). */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
