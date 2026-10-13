// Runtime configuration from environment variables (documented in CLAUDE.md and .env.example).

export const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/app';
const DEFAULT_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  logLevel: string;
}

function readPort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readPort(env.PORT, 3000),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    jwtSecret: env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
