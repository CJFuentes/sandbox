import {
  ErrorCode,
  loginBodySchema,
  registerBodySchema,
  type AuthResponse,
  type User,
} from '@app/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../db/client';
import { users, type UserRow } from '../db/schema';
import { requireUser, signToken } from '../lib/auth';
import { AppError, conflict, unauthenticated } from '../lib/errors';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../lib/passwords';
import { parseBody } from '../lib/validation';

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt.toISOString() };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', { config: { public: true } }, async (request, reply): Promise<AuthResponse> => {
    const body = parseBody(registerBodySchema, request.body);
    const passwordHash = await hashPassword(body.password);
    let row: UserRow | undefined;
    try {
      [row] = await app.db
        .insert(users)
        .values({ email: body.email, name: body.name, passwordHash })
        .returning();
    } catch (error) {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw conflict(ErrorCode.EMAIL_TAKEN, 'Email is already registered');
      }
      throw error;
    }
    if (row === undefined) throw new Error('insert returned no row');
    const token = await signToken(row.id, app.config.jwtSecret);
    void reply.status(201);
    return { token, user: toUser(row) };
  });

  app.post('/auth/login', { config: { public: true } }, async (request): Promise<AuthResponse> => {
    const body = parseBody(loginBodySchema, request.body);
    const [row] = await app.db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const passwordOk = await verifyPassword(body.password, row?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (row === undefined || !passwordOk) {
      throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }
    const token = await signToken(row.id, app.config.jwtSecret);
    return { token, user: toUser(row) };
  });

  app.get('/auth/me', async (request): Promise<User> => {
    const { id } = requireUser(request);
    const [row] = await app.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (row === undefined) throw unauthenticated();
    return toUser(row);
  });
};
