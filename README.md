# Playoff Best Ball

A hosted multi-tenant NFL playoff best ball league platform. Commissioners create leagues, friends join via invite links, and teams are assembled through an async slow-snake draft with notifications. Scoring runs automatically through the playoffs using optimal best-ball lineup selection. **Free tier:** standard scoring presets, ads shown. **Premium ($25/season by default; override with `PREMIUM_PRICE_CENTS`):** custom per-value scoring, up to 25 teams, multiple entries per person, next-week projections, multiple leagues, no ads.

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

> **Optional:** run `npx inngest-cli@latest dev` in a separate terminal to enable draft pick clocks, notification timers, scheduled draft starts, and the scheduled crons (stat sync, odds sync, weekly recaps/previews) locally. Drafting works without it; timers and emails just won't fire, and Inngest event sends log a console warning.

### Stripe (Premium upgrades)

Add your Stripe test keys to `.env` (see `.env.example`):

```
STRIPE_SECRET_KEY=sk_test_<your-test-key>
STRIPE_WEBHOOK_SECRET=whsec_<your-webhook-secret>
```

In a separate terminal, forward webhook events to the local server:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

When `STRIPE_SECRET_KEY` is empty the upgrade button returns an error — Premium features are still accessible in the DB by setting `tier = 'PREMIUM'` directly.

The premium price is config-driven: `PREMIUM_PRICE_CENTS` (default `2500` = $25). Invalid or out-of-range values fall back to the default with a console warning.

### Google AdSense (ads on free tier)

Set the AdSense client and slot in `.env` (see `.env.example`):

```
NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx
NEXT_PUBLIC_ADSENSE_SLOT=xxxxxxxxxxxxxxxx
```

When these variables are empty the ad slot components render nothing — safe for local dev.

> **No ads this season** — the AdSense slot stays env-gated off in production (leave both variables unset).

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

### Vegas odds (The Odds API)

Set the key in `.env` (see `.env.example`):

```
ODDS_API_KEY=xxxxxxxx
```

A free-tier key from [The Odds API](https://the-odds-api.com/) is plenty — odds sync runs once per day as part of the daily stats cron. When the key is empty the odds sync step skips with a console warning and projections fall back to a 0.5 win probability for every team — safe for local dev.

### Analytics (PostHog)

Optional and fully off when unset (see `.env.example`):

```
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxx     # client: pageviews/autocapture (build-time)
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_KEY=phc_xxxx                 # server: webhook/cron event capture (runtime)
POSTHOG_HOST=https://us.i.posthog.com
```

The `NEXT_PUBLIC_*` pair is inlined into the client bundle at build time; the server pair captures the monetization funnel events (league created/joined, draft completed, upgrade started/completed, dues interest) from API routes, the Stripe webhook, and Inngest functions.

### Ops alerts (Slack)

```
OPS_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

Background sync jobs (live/daily stats, odds) alert to this incoming webhook after 3 consecutive failures and announce recovery. When empty, alerts go to `console.warn` only — safe for local dev.

### Stats provider switch

```
STATS_PROVIDER=fake
```

Unset (default) syncs real data from ESPN. `fake` is the December-beta mode: crons never hit ESPN, and playoff weeks advance via the admin panel's "Advance mock week" button (same simulation as `npm run mock:week`).

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

## Engagement & analytics

- **Weekly recaps & pre-weekend previews** — an hourly Inngest cron (`engagement-cron`) finds leagues owed a recap (all of a week's games FINAL) or a preview (upcoming games within 48h) and fans out one send event per league × week. Per-league watermarks make sends idempotent — each league gets each recap/preview at most once. Locally these require the Inngest dev server (same note as the other crons above).
- **Injury substitutions** — a commissioner-only league setting, off by default (League → Settings → "Allow injury substitutions"). The commissioner swaps an injured player for an undrafted player at the same position; the original player's points keep counting for weeks before the substitution's effective week.
- **Projections (Premium)** — a per-entry projections table: recency-weighted recent playoff scoring × Vegas win probabilities, summed into a next-week optimal-lineup expected total. Without odds data every win probability falls back to 0.5. Premium leagues also allow multiple entries per person (added before the draft starts).

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
    odds/         # Team odds sync, recency-weighted point projections
    engagement/   # Weekly recap/preview builders + due-work watermarks
  lib/            # DB client, auth config, session helpers
    stats/        # ESPN HTTP adapter (espn-provider, espn-parse)
  app/            # Next.js routes and API handlers
  components/     # Shared UI components
  inngest/        # Durable functions (pick clock, notification timers, stat/odds sync + engagement crons)
tests/            # Vitest unit/integration tests
e2e/              # Playwright end-to-end tests
data/             # Player pool fixtures (players-2026.json)
```

## Deploying

Production runs on Vercel + Neon + Inngest, with secrets in Doppler. The one-time setup — every integration, the full env var table (required vs optional, build-time `NEXT_PUBLIC_*` callouts), seeding, smoke tests, and the December beta → January launch flip — is documented in the operator runbook:

**[`docs/runbooks/production-setup.md`](docs/runbooks/production-setup.md)**

`npm ci` runs `postinstall: prisma generate`, so fresh Vercel builds get a generated Prisma client automatically.

## Docs

- **Product & technical design:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md`
- **Phase implementation plans:** `docs/superpowers/plans/`
