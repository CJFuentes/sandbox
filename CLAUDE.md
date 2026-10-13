# CLAUDE.md

Full-stack TypeScript monorepo: a Fastify + PostgreSQL API and a React web app, with registration,
login, JWT auth and a health endpoint already implemented. Features are added on top of it.

**Binding conventions: [`docs/contract.md`](docs/contract.md).** Routes, status codes, the error format,
list envelope, data formats, auth, `data-testid` naming and web UI behaviour are fixed there, and each
feature's issue adds its own contract. Read it before changing the API or the UI.

## Stack

| Part | Tech |
|---|---|
| Runtime | Node 24, pnpm 12.11.2 workspace, TypeScript 6 (strict), ESM everywhere |
| `apps/api` | Fastify 5, Drizzle ORM + node-postgres on PostgreSQL 16, Zod validation, JWT (jose), run with tsx |
| `apps/web` | React 19, React Router 8, Vite 8 (dev server and preview proxy `/api` to the API) |
| `packages/shared` | Types, error codes, format helpers and Zod schemas used by both apps (imported as `@app/shared`) |
| Tests | Vitest 5 (API tests against a real database; web tests in jsdom), Playwright 1.64 (Chromium) |
| Lint | ESLint 10 + typescript-eslint `strictTypeChecked`, React Hooks rules |
| CI | `.github/workflows/ci.yml`: lint, typecheck, unit, e2e, with a PostgreSQL 16 service |

## Commands

Run everything from the repository root. The app needs PostgreSQL 16 at `DATABASE_URL` and nothing else.

| Purpose | Command |
|---|---|
| Install | `pnpm install` |
| Apply migrations | `pnpm db:migrate` |
| Create a migration after changing `apps/api/src/db/schema.ts` | `pnpm db:generate` |
| Build | `pnpm build` (web bundle; the API runs from source with tsx) |
| Start (production mode) | `pnpm start` (API on :3000 and the built web app on :5173; run `pnpm db:migrate` and `pnpm build` first) |
| Dev servers with reload | `pnpm dev` (API on :3000, web on :5173) |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit and API tests | `pnpm test` (applies migrations first; needs the database) |
| End-to-end tests | `pnpm e2e` (migrates, builds and starts both servers, then runs Playwright) |
| Install the e2e browser (once per machine) | `pnpm --filter @app/web exec playwright install chromium` |

One package only: `pnpm --filter @app/api test`, `pnpm --filter @app/web test`, `pnpm --filter @app/web e2e`.
One test file: `pnpm vitest run apps/api/test/auth.test.ts`, `pnpm --filter @app/web exec playwright test e2e/auth.spec.ts`.

### Launching the app (manual or browser QA)

```bash
pnpm install && pnpm db:migrate && pnpm build
pnpm start > app.log 2>&1 &                 # background; stop it with: kill %1 (or kill the node processes)
curl -s http://localhost:3000/api/v1/health # {"status":"ok"} when the API is up
# open http://localhost:5173 in a browser (register at /register, or sign in at /login)
```
Use `pnpm dev` instead of `pnpm start` while editing code. `pnpm e2e` reuses servers already running on the ports
locally (never in CI).

## Ports and environment

All variables are optional; the defaults below are what CI and the commands above use (see `.env.example`).
The app reads the process environment only; it does not load `.env` files.

| Variable | Default | Used by |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/app` | API, migrations, API tests |
| `PORT` | `3000` | API port |
| `HOST` | `127.0.0.1` | API bind address |
| `JWT_SECRET` | a development-only value | API token signing; set a real secret outside development |
| `LOG_LEVEL` | `info` | API logger (pino JSON on stdout) |
| `WEB_PORT` | `5173` | web dev and preview server |
| `API_URL` | `http://localhost:3000` | API base URL: target of the web server's `/api` proxy, e2e server check |
| `WEB_URL` | `http://localhost:5173` | web base URL: Playwright `baseURL` |

## Layout

```
apps/api/
  src/app.ts            buildApp(): plugins, error handling, auth hook, route registration
  src/server.ts         entry point (listen on HOST:PORT)
  src/config.ts         environment -> AppConfig
  src/db/schema.ts      Drizzle tables          src/db/client.ts   pool + Drizzle client, pg error codes
  src/db/migrate.ts     migration runner        drizzle/           generated SQL migrations (committed)
  src/lib/errors.ts     AppError + helpers (validationError, notFound, forbidden, conflict, unprocessable), error handler
  src/lib/validation.ts parseBody / parseQuery (Zod)
  src/lib/pagination.ts paginationQuery + listResponse (list envelope)
  src/lib/ids.ts        idEquals(column, id): id condition where a malformed id matches nothing
  src/lib/auth.ts       JWT, auth hook, requireUser()
  src/routes/*.ts       route plugins (health, auth)
  test/                 Vitest API tests (helpers.ts: createTestApp, registerUser, expectError, ...)
apps/web/
  src/App.tsx           routes                  src/main.tsx       bootstrap
  src/api/client.ts     apiRequest(), ApiError, token storage (localStorage "auth.token")
  src/auth/             AuthProvider, useAuth(), useCurrentUser(), RequireAuth
  src/components/       Layout (nav bar), NotFound (app-not-found), Forbidden (app-forbidden), FormError
  src/pages/            LoginPage, RegisterPage, HomePage
  test/                 Vitest + Testing Library tests (jsdom)
  e2e/                  Playwright tests
packages/shared/src/    api-types.ts, formats.ts (§1.3 rules), schemas.ts (Zod helpers, auth bodies)
docs/contract.md        binding conventions
```

## How to add a feature

**API**
- Put routes in `apps/api/src/routes/<feature>.ts` as a `FastifyPluginAsync` and register it in `buildApp()` with
  `{ prefix: '/api/v1' }`. Every route requires a bearer token unless it sets `config: { public: true }`; get the
  caller with `requireUser(request)`.
- Validate bodies with `parseBody(schema, request.body)` and query strings with `parseQuery(schema, request.query)`,
  building schemas from the `@app/shared` helpers (`requiredString`, `optionalText`, `email`, `entityId`, `integer`,
  `instant`, `localDate`, `timeOfDay`, `timeZone`, `queryInt`, `queryBool`). They trim strings, never coerce body
  types, treat empty query values as absent, and produce the contract's `details` paths. Avoid Fastify route schemas
  for bodies.
- Fail by throwing the helpers in `src/lib/errors.ts`; the error handler renders the contract's error body. Unknown
  routes already get 404 `NOT_FOUND`.
- Ids are UUIDs. Validate a body id with `entityId()` (missing, not a string, or empty after trimming: 400). A
  malformed path, body or filter id behaves exactly like an unknown one: query every request id with
  `idEquals(column, id)` from `src/lib/ids.ts`, which matches nothing for a malformed id. A lookup then finds no row
  and throws `notFound()`; a list filter returns an empty list, not an error. (Without it, a malformed id reaching a
  uuid column becomes a 404 even in a list, and logs a warning.) Validate every other request value before it reaches
  SQL: any other value PostgreSQL rejects, such as unchecked integer or enum text, is a 500.
- Lists: extend `paginationQuery` with the list's filters and return `listResponse(items, total, page)`.
- Schema changes: edit `src/db/schema.ts`, run `pnpm db:generate`, commit the generated files in `apps/api/drizzle/`,
  then `pnpm db:migrate`. Never edit a migration that is already committed.
- Return instants with `toISOString()`. Wrap multi-row writes in `app.db.transaction(...)`.

**Web**
- Add pages under `apps/web/src/pages/` and their routes in `App.tsx`, inside the signed-in group (it adds the nav
  bar and redirects signed-out visits to `/login`). Add nav links in `components/Layout.tsx` as `nav-<name>`.
- Call the API through `apiRequest()` in `src/api/` (typed wrappers per feature, like `src/api/auth.ts`).
- Follow the contract's `data-testid` grammar and UI rules: forms use `noValidate`, errors render `<FormError>`
  (its `data-error-code` is the API error code), and a page whose entity is missing renders `<NotFound />`.

**Tests**
- API: `apps/api/test/*.test.ts` with `createTestApp()` and `app.inject()`. Tests create their own data (unique
  emails via `uniqueEmail()`), so they can run in parallel against a shared database.
- Web: component tests in `apps/web/test/`; browser flows in `apps/web/e2e/` (set up data through the API, sign in
  by putting the token in `localStorage["auth.token"]` with `page.addInitScript`).
- The existing tests cover the conventions every feature relies on; keep them passing.

## Dependencies

Add them to the package that uses them with exact versions, e.g. `pnpm --filter @app/api add --save-exact <pkg>`.
pnpm only runs install scripts of packages listed under `allowBuilds` in `pnpm-workspace.yaml`; an unlisted
package with an install script fails the install with `ERR_PNPM_IGNORED_BUILDS`.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: install with the frozen lockfile,
lint, typecheck, migrate, `pnpm test`, install Chromium, `pnpm e2e`. A PR is ready to merge when CI is green.
