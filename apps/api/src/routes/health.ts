import type { HealthResponse } from '@app/shared';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { config: { public: true } }, (): HealthResponse => ({ status: 'ok' }));
};
