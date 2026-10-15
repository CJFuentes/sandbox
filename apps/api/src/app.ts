import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type AppConfig } from './config';
import { createDb, type Db } from './db/client';
import { authHook } from './lib/auth';
import { errorHandler, notFoundHandler } from './lib/errors';
import { registerBodyParsers, registerSchemaValidators } from './lib/http';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { notesRoutes } from './routes/notes';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: AppConfig;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
  /** Fastify logging; off by default (tests), on in src/server.ts. */
  logger?: boolean;
}

/**
 * Builds the API. Every route lives under /api/v1 and requires a bearer token unless it is
 * registered with `config: { public: true }`. Register new route plugins at the end.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: options.logger === true ? { level: config.logLevel } : false,
  });

  const { db, pool } = createDb(config.databaseUrl);
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorateRequest('user', null);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  registerBodyParsers(app);
  registerSchemaValidators(app);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook('onRequest', authHook(config.jwtSecret));

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(notesRoutes, { prefix: '/api/v1' });

  return app;
}
