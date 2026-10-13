// JWT bearer authentication (docs/contract.md §1.6). Every route requires a valid token unless it
// is registered with `config: { public: true }`; the hook sets `request.user` for the others.
import { isUuid } from '@app/shared';
import type { FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { unauthenticated } from './errors';

export interface AuthUser {
  id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user on protected routes; `null` on public routes. */
    user: AuthUser | null;
  }
  interface FastifyContextConfig {
    /** Set on routes that do not require a token. */
    public?: boolean;
  }
}

const TOKEN_TTL = '7d';
const ALGORITHM = 'HS256';

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function signToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey(secret));
}

/** The user id in a valid token, or `null` for a malformed, wrongly signed or expired one. */
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: [ALGORITHM] });
    return typeof payload.sub === 'string' && isUuid(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/** onRequest hook: 401 UNAUTHENTICATED unless the route is public or the bearer token is valid. */
export function authHook(secret: string) {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    if (request.is404 || request.routeOptions.config.public === true) return;
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    const userId = token === undefined ? null : await verifyToken(token, secret);
    if (userId === null) throw unauthenticated();
    request.user = { id: userId };
  };
}

/** The signed-in user. Use it in handlers of protected routes. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (request.user === null) throw unauthenticated();
  return request.user;
}
