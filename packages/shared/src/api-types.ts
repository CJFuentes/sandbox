// Wire types of the HTTP API (docs/contract.md §1.4-§1.6).

/** Base path of every API endpoint. */
export const API_PREFIX = '/api/v1';

/** localStorage key that holds the session token in the web app (§1.9). */
export const AUTH_TOKEN_STORAGE_KEY = 'auth.token';

/** Global error codes (§1.4). Features add their own codes. */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INTERNAL: 'INTERNAL',
} as const;
export type GlobalErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  /** Dotted path of the offending property or query parameter; "" when no property is to blame. */
  path: string;
  message: string;
}

/** Body of every non-2xx response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
}

/** Envelope of every list endpoint (§1.5). */
export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Instants are serialised as `Date.prototype.toISOString()` strings. */
export type Instant = string;

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Instant;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface HealthResponse {
  status: 'ok';
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
