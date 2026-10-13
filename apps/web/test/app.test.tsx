import { AUTH_TOKEN_STORAGE_KEY } from '@app/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AuthProvider } from '../src/auth/AuthProvider';

const user = { id: 'u1', email: 'ada@example.test', name: 'Ada', createdAt: '2026-01-01T00:00:00.000Z' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('redirects a signed-out visit to the login page', async () => {
    renderAt('/anything/deep');
    expect(await screen.findByTestId('login-submit')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in from a stored token and shows the nav and greeting', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
    fetchMock.mockResolvedValue(jsonResponse(200, user));
    renderAt('/');
    expect((await screen.findByTestId('home-greeting')).textContent).toContain('Ada');
    expect(screen.getByTestId('nav-user').textContent).toContain('ada@example.test');
  });

  it('removes a token the API rejects and goes to the login page', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'stale');
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }));
    renderAt('/');
    expect(await screen.findByTestId('login-submit')).toBeTruthy();
    expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('renders app-not-found for an unknown route when signed in', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
    fetchMock.mockResolvedValue(jsonResponse(200, user));
    renderAt('/no/such/page');
    expect(await screen.findByTestId('app-not-found')).toBeTruthy();
    expect(screen.getByTestId('nav-home')).toBeTruthy();
  });

  it('shows the API error code on the login form', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }),
    );
    renderAt('/login');
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByTestId('login-submit'));
    const error = await screen.findByTestId('login-error');
    expect(error.getAttribute('data-error-code')).toBe('INVALID_CREDENTIALS');
  });
});
