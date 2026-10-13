import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
// Serialises concurrent migration runs (for example the test setup and a dev server).
const MIGRATION_LOCK_KEY = 7_202_610;

/** Applies every pending migration in apps/api/drizzle. Safe to run concurrently and repeatedly. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}
