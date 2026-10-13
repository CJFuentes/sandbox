// HTTP conventions every endpoint inherits from the app setup (docs/contract.md §1.2-§1.5).
// Test-only routes are registered on the test app to exercise them.
import { entityId, requiredString } from '@app/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { users } from '../src/db/schema';
import { requireUser } from '../src/lib/auth';
import { notFound } from '../src/lib/errors';
import { idEquals } from '../src/lib/ids';
import { listResponse, paginationQuery } from '../src/lib/pagination';
import { parseBody, parseQuery } from '../src/lib/validation';
import { bearer, createTestApp, expectError, expectValidationError, registerUser } from './helpers';

const echoSchema = z.object({ name: requiredString(20) });
const lookupSchema = z.object({ userId: entityId() });

let app: FastifyInstance;
let token: string;
let userId: string;

beforeAll(async () => {
  app = await createTestApp((instance) => {
    instance.post('/api/v1/test-only/echo', async (request) => {
      requireUser(request);
      return parseBody(echoSchema, request.body);
    });
    instance.get('/api/v1/test-only/users/:id', async (request) => {
      const { id } = request.params as { id: string };
      const [row] = await instance.db.select().from(users).where(eq(users.id, id));
      return { found: row !== undefined };
    });
    instance.post('/api/v1/test-only/lookup', async (request) => {
      const body = parseBody(lookupSchema, request.body);
      const [row] = await instance.db.select({ id: users.id }).from(users).where(idEquals(users.id, body.userId));
      if (row === undefined) throw notFound();
      return row;
    });
    // Without idEquals(): the error handler's safety net for uuid input errors still answers a
    // malformed id with 404 (and logs a warning), never 500.
    instance.post('/api/v1/test-only/lookup-unchecked', async (request) => {
      const body = parseBody(lookupSchema, request.body);
      const [row] = await instance.db.select({ id: users.id }).from(users).where(eq(users.id, body.userId));
      if (row === undefined) throw notFound();
      return row;
    });
    // Any other value PostgreSQL rejects as text (here an integer) is not an id: the bug stays a 500.
    instance.post('/api/v1/test-only/integer-cast', async (request) => {
      const body = parseBody(z.object({ value: z.string() }), request.body);
      const result = await instance.db.execute<{ n: number }>(sql`select ${body.value}::integer as n`);
      return { n: result.rows[0]?.n };
    });
    instance.get('/api/v1/test-only/users-by-id', async (request) => {
      const query = parseQuery(paginationQuery.extend({ userId: z.string() }), request.query);
      // idEquals(): a malformed filter id matches nothing (§1.3); it never reaches the uuid column.
      const rows = await instance.db.select({ id: users.id }).from(users).where(idEquals(users.id, query.userId));
      return listResponse(rows, rows.length, query);
    });
    instance.get('/api/v1/test-only/list', async (request) => {
      const page = parseQuery(paginationQuery, request.query);
      return listResponse([{ id: 'a' }], 57, page);
    });
    instance.post(
      '/api/v1/test-only/schema/:id',
      {
        schema: {
          params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
          body: {
            type: 'object',
            required: ['count'],
            properties: { count: { type: 'integer' } },
          },
          querystring: { type: 'object', properties: { n: { type: 'integer' } } },
        },
      },
      async (request) => ({ body: request.body, query: request.query }),
    );
    instance.get('/api/v1/test-only/crash', async () => {
      throw new Error('boom: secret detail');
    });
  });
  const registered = await registerUser(app);
  token = registered.token;
  userId = registered.user.id;
});

afterAll(async () => {
  await app.close();
});

describe('routing', () => {
  it('answers unknown routes and unsupported methods with 404 NOT_FOUND', async () => {
    expectError(await app.inject({ method: 'GET', url: '/api/v1/nope' }), 404, 'NOT_FOUND');
    expectError(await app.inject({ method: 'GET', url: '/' }), 404, 'NOT_FOUND');
    expectError(await app.inject({ method: 'DELETE', url: '/api/v1/auth/me', headers: bearer(token) }), 404, 'NOT_FOUND');
    expectError(await app.inject({ method: 'PUT', url: '/api/v1/health' }), 404, 'NOT_FOUND');
  });

  it('requires a token on every route that is not public, before validating the body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/test-only/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expectError(response, 401, 'UNAUTHENTICATED');
  });

  it('hides internal errors behind 500 INTERNAL', async () => {
    const error = expectError(await app.inject({ method: 'GET', url: '/api/v1/test-only/crash', headers: bearer(token) }), 500, 'INTERNAL');
    expect(error.message).not.toContain('secret');
  });
});

describe('request bodies', () => {
  const echo = (headers: Record<string, string>, payload?: string) =>
    app.inject({ method: 'POST', url: '/api/v1/test-only/echo', headers: { ...bearer(token), ...headers }, payload });

  it('treats a missing or empty body as {}, whatever its Content-Type', async () => {
    expectValidationError(await echo({}), 'name');
    expectValidationError(await echo({ 'content-type': 'application/json' }, ''), 'name');
    expectValidationError(await echo({ 'content-type': 'text/plain' }, ''), 'name');
    expectValidationError(await echo({ 'content-type': 'application/xml' }, ''), 'name');
    expectValidationError(await app.inject({ method: 'POST', url: '/api/v1/auth/login' }), 'email', 'password');
  });

  it('answers 400 VALIDATION_FAILED with path "" for malformed JSON or a non-object body', async () => {
    expectValidationError(await echo({ 'content-type': 'application/json' }, '{"name":'), '');
    expectValidationError(await echo({ 'content-type': 'application/json' }, '[1,2]'), '');
    expectValidationError(await echo({ 'content-type': 'application/json' }, 'null'), '');
  });

  it('trims strings, ignores unknown properties and never coerces types', async () => {
    const ok = await echo({ 'content-type': 'application/json' }, JSON.stringify({ name: '  Ada ', extra: true }));
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ name: 'Ada' });
    expectValidationError(await echo({ 'content-type': 'application/json' }, JSON.stringify({ name: 5 })), 'name');
    expectValidationError(await echo({ 'content-type': 'application/json' }, JSON.stringify({ name: null })), 'name');
  });

  it('keeps route-schema body validation free of coercion, with details paths', async () => {
    const url = '/api/v1/test-only/schema/6f1c1f0e-8d1b-4c39-9a57-2b1a5c0f9e11';
    const send = (payload: object, query = '') =>
      app.inject({ method: 'POST', url: `${url}${query}`, headers: bearer(token), payload });
    expectValidationError(await send({ count: '3' }), 'count');
    expectValidationError(await send({}), 'count');
    const ok = await send({ count: 3 }, '?n=4');
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ body: { count: 3 }, query: { n: 4 } });
  });
});

describe('ids', () => {
  const lookup = (path: string, payload: object) =>
    app.inject({ method: 'POST', url: `/api/v1/test-only/${path}`, headers: bearer(token), payload });

  it('treats a malformed path id like an unknown one (404), never a 500', async () => {
    expectError(await app.inject({ method: 'GET', url: '/api/v1/test-only/users/not-a-uuid', headers: bearer(token) }), 404, 'NOT_FOUND');
    expectError(
      await app.inject({ method: 'POST', url: '/api/v1/test-only/schema/not-a-uuid', headers: bearer(token), payload: { count: 1 } }),
      404,
      'NOT_FOUND',
    );
  });

  it('answers 400 for a body id that is missing, not a string or empty after trimming', async () => {
    expectValidationError(await lookup('lookup', {}), 'userId');
    for (const value of ['', '   ', 42, null]) {
      expectValidationError(await lookup('lookup', { userId: value }), 'userId');
    }
  });

  it('treats a malformed or unknown body id like a missing entity (404), never a 500', async () => {
    for (const path of ['lookup', 'lookup-unchecked']) {
      expectError(await lookup(path, { userId: 'not-a-uuid' }), 404, 'NOT_FOUND');
      expectError(await lookup(path, { userId: '00000000-0000-4000-8000-000000000000' }), 404, 'NOT_FOUND');
      const found = await lookup(path, { userId: ` ${userId} ` });
      expect(found.statusCode, found.body).toBe(200);
      expect(found.json()).toEqual({ id: userId });
    }
  });

  it('keeps other values PostgreSQL rejects as text a loud 500: only uuid errors mean a malformed id', async () => {
    const ok = await lookup('integer-cast', { value: '42' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({ n: 42 });
    expectError(await lookup('integer-cast', { value: 'abc' }), 500, 'INTERNAL');
  });

  it('lets a malformed filter id match nothing, and an empty required filter count as missing', async () => {
    const filter = (query: string) =>
      app.inject({ method: 'GET', url: `/api/v1/test-only/users-by-id${query}`, headers: bearer(token) });
    expect((await filter('?userId=not-a-uuid')).json()).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
    expect((await filter(`?userId=${userId}`)).json()).toEqual({ items: [{ id: userId }], total: 1, limit: 20, offset: 0 });
    expectValidationError(await filter('?userId='), 'userId');
  });
});

describe('list envelope and paging', () => {
  const list = (query: string) =>
    app.inject({ method: 'GET', url: `/api/v1/test-only/list${query}`, headers: bearer(token) });

  it('defaults limit to 20 and offset to 0, also for empty values', async () => {
    expect((await list('')).json()).toEqual({ items: [{ id: 'a' }], total: 57, limit: 20, offset: 0 });
    expect((await list('?limit=&offset=')).json()).toEqual({ items: [{ id: 'a' }], total: 57, limit: 20, offset: 0 });
    expect((await list('?limit=100&offset=40')).json()).toMatchObject({ limit: 100, offset: 40 });
  });

  it('answers 400 for out-of-range or non-decimal values', async () => {
    for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?limit=1.5', '?offset=-1']) {
      const path = query.slice(1).split('=')[0] ?? '';
      expectValidationError(await list(query), path);
    }
  });
});
