// `pnpm start` / `pnpm dev` entry point: listens on HOST:PORT (default 127.0.0.1:3000).
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp({ config, logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

await app.listen({ port: config.port, host: config.host });
