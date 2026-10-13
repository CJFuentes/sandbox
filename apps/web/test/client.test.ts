import { AUTH_TOKEN_STORAGE_KEY } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '../src/api/client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('apiRequest', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends JSON with the bearer token from auth.token', async () => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true }));

    await expect(apiRequest('/things', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/things');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init?.body).toBe('{"a":1}');
  });

  it('sends bodyless requests without a body or Content-Type, and leaves out empty query values', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest('/things/1', { method: 'DELETE', query: { q: '', limit: 5 } })).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/things/1?limit=5');
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('rejects with the API error code and details', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { code: 'VALIDATION_FAILED', message: 'bad', details: [{ path: 'name', message: 'Required' }] } }),
    );

    const error = await apiRequest('/things').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', details: [{ path: 'name' }] });
  });

  it('rejects with NETWORK_ERROR when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiRequest('/things')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
