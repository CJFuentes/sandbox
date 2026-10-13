import { loadConfig } from '../src/config';
import { runMigrations } from '../src/db/migrate';

// Runs once before the API test files: brings DATABASE_URL up to the latest migration.
export default async function setup(): Promise<void> {
  await runMigrations(loadConfig().databaseUrl);
}
