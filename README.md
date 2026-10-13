# App

A full-stack TypeScript monorepo: Fastify + Drizzle + PostgreSQL 16 API (`apps/api`), React + Vite web app
(`apps/web`) and shared types and schemas (`packages/shared`). Registration, login, JWT auth and a health
endpoint are implemented.

```bash
pnpm install
pnpm db:migrate        # needs PostgreSQL 16 at DATABASE_URL (default postgresql://postgres:postgres@localhost:5432/app)
pnpm dev               # API on http://localhost:3000, web on http://localhost:5173
```

Commands, environment variables and project conventions: [`CLAUDE.md`](CLAUDE.md).
API and UI conventions: [`docs/contract.md`](docs/contract.md).
