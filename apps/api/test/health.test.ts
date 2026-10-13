import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /api/v1/health', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 {status:"ok"} without a token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
