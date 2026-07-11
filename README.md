# Playoff Best Ball

A hosted multi-tenant NFL playoff best ball league platform. Commissioners create leagues, friends join via invite links, and teams are assembled through an async slow-snake draft with notifications. Scoring runs automatically through the playoffs using optimal best-ball lineup selection. Phase 1 currently implements auth, league creation, and the invite/join flow.

## Local Setup

**Prerequisites:** Node 24+ (bundles npm 11 — lockfile changes must be generated with npm 11), Docker

```bash
docker compose up -d
cp .env.example .env
npm install
npm run db:push
npm run dev
```

- Dev DB runs on port **5434** (to avoid conflicts with other local Postgres instances)
- Test DB runs on port **5433**
- Magic links are logged to the dev console when `RESEND_API_KEY` is empty

## Testing

```bash
# One-time setup: push schema to the test DB (also re-run after schema changes)
npm run db:push:test

# Unit/integration tests (Vitest — requires docker test DB on 5433)
npm test

# End-to-end tests (Playwright — requires docker test DB on 5433)
npx playwright install chromium  # first run only
npm run test:e2e
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm test` | Vitest unit/integration tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:push` | Push schema to dev DB (5434) |
| `npm run db:push:test` | Push schema to test DB (5433) |

## Project Structure

```
src/
  domain/     # Pure business logic (no framework deps)
  lib/        # DB client, auth config, session helpers
  app/        # Next.js routes and API handlers
  components/ # Shared UI components
tests/        # Vitest unit/integration tests
e2e/          # Playwright end-to-end tests
legacy/       # Archived v0 prototype — reference only, removed after Phase 3
```

## Docs

- **Product & technical design:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md`
- **Phase implementation plans:** `docs/superpowers/plans/`
