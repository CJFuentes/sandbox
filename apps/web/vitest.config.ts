import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component and unit tests (jsdom). Browser end-to-end tests live in e2e/ and run with Playwright.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
