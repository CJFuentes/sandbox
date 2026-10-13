// HTTP client for the API (same origin: the web server proxies /api). Adds the session token,
// sends JSON, and turns every error response into an ApiError carrying the API's error code.
import { API_PREFIX, AUTH_TOKEN_STORAGE_KEY, isApiErrorBody, type ErrorDetail } from '@app/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[];

  constructor(status: number, code: string, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Any thrown value as an ApiError (network failures get the code NETWORK_ERROR). */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Request failed');
}

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON. Omit it for bodyless requests (no body and no Content-Type are sent). */
  body?: unknown;
  /** Query parameters; `undefined` and empty values are left out. */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Calls `/api/v1<path>` and resolves with the parsed JSON body (`undefined` for 204).
 * Rejects with an ApiError for non-2xx responses and network failures.
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.size > 0 ? `?${params.toString()}` : '';

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}${search}`, { method: options.method ?? 'GET', headers, body });
  } catch (error) {
    throw toApiError(error);
  }

  const text = await response.text();
  let data: unknown;
  if (text !== '') {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!response.ok) {
    if (isApiErrorBody(data)) {
      throw new ApiError(response.status, data.error.code, data.error.message, data.error.details);
    }
    throw new ApiError(response.status, 'INTERNAL', `Request failed with status ${response.status}`);
  }
  return data;
}
