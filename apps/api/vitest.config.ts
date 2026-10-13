import { defineConfig } from 'vitest/config';

// API tests talk to a real PostgreSQL (DATABASE_URL). The global setup applies the migrations first.
export default defineConfig({
  test: {
    name: 'api',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
