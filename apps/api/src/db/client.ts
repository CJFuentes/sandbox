import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** A pooled Drizzle client. Close the pool (`pool.end()`) on shutdown. */
export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, pool };
}

interface PgDriverError {
  code: string;
  message: string;
  routine: string | undefined;
}

/** The node-postgres error behind `error` (it has a SQLSTATE `code`), also when Drizzle wraps it. */
function pgDriverError(error: unknown): PgDriverError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) {
      const message = 'message' in current && typeof current.message === 'string' ? current.message : '';
      const routine = 'routine' in current && typeof current.routine === 'string' ? current.routine : undefined;
      return { code: current.code, message, routine };
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

/** The PostgreSQL error code (SQLSTATE) of a driver error, also when Drizzle wraps it. */
export function pgErrorCode(error: unknown): string | undefined {
  return pgDriverError(error)?.code;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_INVALID_TEXT_REPRESENTATION = '22P02';

/**
 * True when PostgreSQL rejected a value as a uuid (22P02 raised by its uuid parser): a malformed id
 * reached a uuid column. Any other 22P02 (an integer, enum, boolean or JSON value) is not an id.
 */
export function isMalformedUuidError(error: unknown): boolean {
  const driverError = pgDriverError(error);
  if (driverError?.code !== PG_INVALID_TEXT_REPRESENTATION) return false;
  return driverError.routine === 'string_to_uuid' || driverError.message.includes('for type uuid');
}
