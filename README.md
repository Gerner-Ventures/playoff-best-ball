# Playoff Best Ball

A hosted multi-tenant NFL playoff best ball league platform. Commissioners create leagues, friends join via invite links, and teams are assembled through an async slow-snake draft with notifications. Scoring runs automatically through the playoffs using optimal best-ball lineup selection. Phase 1 currently implements auth, league creation, and the invite/join flow.

## Local Setup

**Prerequisites:** Node 24+ (bundles npm 11 — lockfile changes must be generated with npm 11), Docker

```bash
docker compose up -d
cp .env.example .env
npm install
npm run db:push
npm run db:seed:players
npm run dev
```

> **Optional:** run `npx inngest-cli@latest dev` in a separate terminal to enable draft pick clocks, notification timers, and scheduled draft starts locally. Drafting works without it; timers and emails just won't fire, and Inngest event sends log a console warning.

### SMS notifications (Twilio)

Set the three Twilio vars in `.env` (see `.env.example`):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+15555550000
```

When these are empty the app logs SMS messages to the dev console instead of sending them — safe for local dev. Commissioners and users opt in on `/settings/notifications`.

### Push notifications (VAPID)

Generate a key pair once and add both to `.env`:

```bash
npx web-push generate-vapid-keys
```

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_SUBJECT=mailto:hello@example.com
```

The app is an installable **PWA** (manifest + service worker). Web Push requires HTTPS in production — it also works on `localhost` during development. On iOS, users must first **Add to Home Screen** before the browser exposes the Push API.

When `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is empty the push UI falls back to an "unsupported" message.

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

> `npm run test:e2e` seeds the test-DB player pool automatically via Playwright global setup — no manual seed step required.

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
| `npm run mock:week -- <1-4>` | Simulate a playoff week against the dev DB (generates fake stat lines for all players and runs the scoring engine) |

## Admin panel

`/admin` is unlocked for emails listed in the `ADMIN_EMAILS` environment variable (comma-separated). It provides:

- **Pool sync** — pull the current player pool from ESPN into the dev/production DB
- **Week sync** — fetch and store stat lines for a given playoff week
- **Manual stat override** — edit individual player stat lines directly (useful for correcting ESPN data)

## Project Structure

```
src/
  domain/         # Pure business logic (no framework deps)
    draft/        # Draft engine: snake order, slot assignment, pick clock, start/pick/autodraft/queue services
    stats/        # Stat lines, StatsProvider interface, player-pool sync, week-stats sync
    scoring/      # Points engine (compute-points), best-ball optimizer
  lib/            # DB client, auth config, session helpers
    stats/        # ESPN HTTP adapter (espn-provider, espn-parse)
  app/            # Next.js routes and API handlers
  components/     # Shared UI components
  inngest/        # Durable functions (pick clock, notification timers, stat sync crons)
tests/            # Vitest unit/integration tests
e2e/              # Playwright end-to-end tests
data/             # Player pool fixtures (players-2026.json)
```

## Docs

- **Product & technical design:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md`
- **Phase implementation plans:** `docs/superpowers/plans/`
