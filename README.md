# ocb-spike-toy

A tiny TypeScript utility package used as a sandbox for the orchestrator comparison study.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Test | `npm test` (Vitest) |
| Build | `npm run build` |

Source lives in `src/`; tests sit next to the code as `*.test.ts`. Every exported util is
re-exported from `src/index.ts`. CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on
every pull request and on pushes to `main`.
