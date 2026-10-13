import { defineConfig, devices } from '@playwright/test';

// `pnpm e2e`: browser tests against the built web app (vite preview) and the API. Both servers are
// started here (after applying migrations); locally, servers already running on the ports are reused.
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const CI = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  workers: CI ? 2 : undefined,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @app/api run db:migrate && pnpm --filter @app/api run start',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm run build && pnpm run start',
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
