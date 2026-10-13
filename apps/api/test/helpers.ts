// Test helpers. Tests run against a real database and create their own data (unique emails), so
// they never depend on each other or on an empty database.
import { randomUUID } from 'node:crypto';
import type { ApiErrorBody, AuthResponse } from '@app/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import { buildApp } from '../src/app';

/** Builds the app; `extend` may register extra (test-only) routes before it starts. */
export async function createTestApp(extend?: (app: FastifyInstance) => void): Promise<FastifyInstance> {
  const app = await buildApp();
  extend?.(app);
  await app.ready();
  return app;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<{ email: string; password: string; name: string }> = {},
): Promise<AuthResponse & { password: string }> {
  const body = { email: uniqueEmail(), password: 'correct-horse-battery', name: 'Test User', ...overrides };
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: body });
  expect(response.statusCode, response.body).toBe(201);
  return { ...response.json<AuthResponse>(), password: body.password };
}

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

/** Asserts the contract's error shape and returns it. */
export function expectError(response: LightMyRequestResponse, status: number, code: string): ApiErrorBody['error'] {
  expect(response.statusCode, response.body).toBe(status);
  expect(response.headers['content-type']).toMatch(/^application\/json/);
  const { error } = response.json<ApiErrorBody>();
  expect(error.code).toBe(code);
  expect(typeof error.message).toBe('string');
  return error;
}

/** Asserts 400 VALIDATION_FAILED with a `details` entry for each given path. */
export function expectValidationError(response: LightMyRequestResponse, ...paths: string[]): void {
  const error = expectError(response, 400, 'VALIDATION_FAILED');
  expect(error.details?.length ?? 0).toBeGreaterThan(0);
  const reported = (error.details ?? []).map((detail) => detail.path);
  for (const path of paths) expect(reported).toContain(path);
}
