import type { AuthResponse, User } from '@app/shared';
import type { FastifyInstance } from 'fastify';
import { SignJWT, decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import {
  bearer,
  createTestApp,
  expectError,
  expectValidationError,
  registerUser,
  uniqueEmail,
} from './helpers';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

function register(payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: payload as object });
}

function login(payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: payload as object });
}

function me(headers: Record<string, string> = {}) {
  return app.inject({ method: 'GET', url: '/api/v1/auth/me', headers });
}

describe('POST /api/v1/auth/register', () => {
  it('creates the user and returns 201 {token, user}', async () => {
    const email = uniqueEmail('Register');
    const response = await register({ email: `  ${email.toUpperCase()} `, password: 'pass word 1', name: '  Ada  ' });
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json<AuthResponse>();
    expect(typeof body.token).toBe('string');
    expect(body.user.id).toMatch(UUID);
    expect(body.user.email).toBe(email.toLowerCase());
    expect(body.user.name).toBe('Ada');
    expect(body.user.createdAt).toMatch(ISO_INSTANT);
    expect(JSON.stringify(body).toLowerCase()).not.toContain('password');
  });

  it('issues a token valid for at least 24 hours', async () => {
    const { token } = await registerUser(app);
    const { iat, exp } = decodeJwt(token);
    expect(exp).toBeDefined();
    expect((exp ?? 0) - (iat ?? 0)).toBeGreaterThanOrEqual(24 * 60 * 60);
  });

  it('answers 409 EMAIL_TAKEN for an email registered in any case', async () => {
    const { user } = await registerUser(app);
    expectError(await register({ email: user.email.toUpperCase(), password: 'another-pass', name: 'Bo' }), 409, 'EMAIL_TAKEN');
  });

  it('validates every property with details paths', async () => {
    expectValidationError(await register({}), 'email', 'password', 'name');
    expectValidationError(await register({ email: 'not-an-email', password: 'long-enough', name: 'A' }), 'email');
    expectValidationError(await register({ email: uniqueEmail(), password: 'short', name: 'A' }), 'password');
    expectValidationError(await register({ email: uniqueEmail(), password: 'x'.repeat(129), name: 'A' }), 'password');
    expectValidationError(await register({ email: uniqueEmail(), password: 'long-enough', name: '   ' }), 'name');
    expectValidationError(await register({ email: uniqueEmail(), password: 'long-enough', name: 'n'.repeat(81) }), 'name');
  });

  it('rejects null and wrongly typed values instead of coercing them', async () => {
    expectValidationError(await register({ email: uniqueEmail(), password: 'long-enough', name: null }), 'name');
    expectValidationError(await register({ email: uniqueEmail(), password: 12345678, name: 'A' }), 'password');
    expectValidationError(await register({ email: uniqueEmail(), password: 'long-enough', name: 42 }), 'name');
  });

  it('does not trim passwords and ignores unknown properties', async () => {
    const email = uniqueEmail();
    const created = await register({ email, password: '  spaced  ', name: 'Ada', role: 'admin' });
    expect(created.statusCode, created.body).toBe(201);
    expect((await login({ email, password: '  spaced  ' })).statusCode).toBe(200);
    expectError(await login({ email, password: 'spaced' }), 401, 'INVALID_CREDENTIALS');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 {token, user} for valid credentials, matching the email case-insensitively', async () => {
    const { user, password } = await registerUser(app);
    const response = await login({ email: ` ${user.email.toUpperCase()} `, password });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<AuthResponse>();
    expect(body.user).toEqual(user);
    expect((await me(bearer(body.token))).json<User>()).toEqual(user);
  });

  it('answers 401 INVALID_CREDENTIALS for a wrong password or an unknown email', async () => {
    const { user } = await registerUser(app);
    expectError(await login({ email: user.email, password: 'wrong-password' }), 401, 'INVALID_CREDENTIALS');
    expectError(await login({ email: uniqueEmail(), password: 'whatever-pass' }), 401, 'INVALID_CREDENTIALS');
  });

  it('answers 400 for a missing property', async () => {
    expectValidationError(await login({ email: uniqueEmail() }), 'password');
    expectValidationError(await login({ password: 'whatever-pass' }), 'email');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in user', async () => {
    const { token, user } = await registerUser(app);
    const response = await me(bearer(token));
    expect(response.statusCode).toBe(200);
    expect(response.json<User>()).toEqual(user);
  });

  it('answers 401 UNAUTHENTICATED without a valid token', async () => {
    const secret = new TextEncoder().encode(loadConfig().jwtSecret);
    const { user } = await registerUser(app);
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    const wronglySigned = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('some-other-secret'));
    const unknownUser = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-8000-000000000000')
      .setExpirationTime('1h')
      .sign(secret);

    expectError(await me(), 401, 'UNAUTHENTICATED');
    expectError(await me({ authorization: 'Bearer' }), 401, 'UNAUTHENTICATED');
    expectError(await me({ authorization: 'Basic abc' }), 401, 'UNAUTHENTICATED');
    expectError(await me(bearer('not.a.jwt')), 401, 'UNAUTHENTICATED');
    expectError(await me(bearer(expired)), 401, 'UNAUTHENTICATED');
    expectError(await me(bearer(wronglySigned)), 401, 'UNAUTHENTICATED');
    expectError(await me(bearer(unknownUser)), 401, 'UNAUTHENTICATED');
  });
});
