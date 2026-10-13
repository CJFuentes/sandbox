import { defineConfig } from 'vitest/config';

// Runs every workspace project's Vitest suite: `pnpm test`.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/api', 'apps/web'],
  },
});
