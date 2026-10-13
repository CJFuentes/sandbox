import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server (`pnpm dev`) and production preview (`pnpm start`) both serve the app on WEB_PORT
// (default 5173) and proxy /api to the API at API_URL (default http://localhost:3000).
// Like the API's PORT, an unset or empty WEB_PORT means the default.
function readPort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid WEB_PORT: ${value}`);
  }
  return port;
}

const port = readPort(process.env.WEB_PORT, 5173);
const proxy = { '/api': { target: process.env.API_URL ?? 'http://localhost:3000' } };

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port, strictPort: true, proxy },
});
