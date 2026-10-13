// `pnpm db:migrate`: applies all pending migrations to DATABASE_URL.
import { loadConfig } from '../config';
import { runMigrations } from './migrate';

const { databaseUrl } = loadConfig();
await runMigrations(databaseUrl);
console.log('Migrations applied.');
