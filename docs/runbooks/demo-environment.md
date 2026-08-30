# Demo Environment

A persistent, shareable deployment that can be put into any phase of the product —
pre-draft, mid-draft, or mid-playoffs — with real captured playoff data. It exists so
the platform can be verified end to end, and so a link can be sent to someone.

Design: `docs/superpowers/specs/2026-08-29-demo-environment-design.md`.

## Why demo mode needs its own gate

The demo accepts **email + password** sign-in, because a visitor has no inbox to receive
a magic link. That is a real authentication surface on a public host, so it is gated on
four independent factors rather than one environment variable.

Three are environmental and resolve at boot (`src/lib/demo-mode.ts`):

1. `DEMO_MODE=1` — explicit opt-in. Absent means off and nothing else is evaluated.
   Only the exact string `1` counts; `true`, `yes` and `0` are all off.
2. The host in `BETTER_AUTH_URL` is on a **compiled-in allowlist**. Adding a host is a
   reviewed code change, not an environment edit.
3. No live Stripe key. This is the signal that catches "someone copied the production
   environment into the demo project", which the host check alone would miss if the
   URL came along with it.

If `DEMO_MODE=1` is set and factors 2 or 3 fail, **the app refuses to boot** with an
explanatory error. That is deliberate: a silent "off" is indistinguishable from a gate
that has quietly stopped working.

The fourth factor is **not** in the environment:

4. A `DemoEnvironment` row in the database. The migration creates the table everywhere;
   nothing in the request path ever writes the row. Only `npm run demo:seed` inserts it,
   and only against whatever database an operator points it at.

The fourth factor is the important one. Factors 1-3 all live in the same environment
store, so copying one project's variables wholesale into another would make all three
agree and all three be wrong. A row in a specific database cannot be created by a
settings misclick.

**Production therefore has the table and zero rows, permanently.**

## Rules

- `DEMO_MODE` must never be set on the production project. The app refuses to boot if it
  is set alongside a production host or live Stripe key — but do not rely on that; do not
  set it.
- Never run `npm run demo:seed` against the production database. It writes the sentinel.
- Demo accounts use `@demo.example.com` addresses (RFC 2606 reserved, guaranteed
  undeliverable), so even a misconfigured Resend key cannot reach a real person.

## Insulation from crons

Anything deployed runs the same Inngest crons, and on a demo those would do damage:

| Cron | What it would do to a demo |
|---|---|
| `stats-sync-daily` (6am ET) | Syncs **all four weeks unconditionally** — would finalize the entire season on the first tick, so "live, week 2 of 4" would be gone by morning |
| `stats-sync-live` (every 2 min) | Advances the demo whenever a shifted `startsAt` slips past |
| `engagement-cron` (hourly) | Fans out recap/preview emails, SMS and push |

All three early-return when demo mode is on. Belt and braces, the demo project should
also leave `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` unset, which stops the crons from
firing at all. A useful side effect: draft pick clocks do not fire either, so a visitor's
"on the clock" deadline never expires mid-tour.

Blank outbound keys mean **log, not throw**, when demo mode is on — `notify-email`,
`notify-sms`, `notify-push` and the magic-link sender all carve out the demo. Real
production still fails loudly on a missing key.

## Seeding

```bash
npm run demo:seed -- --phase=live --week=2 --source=historical:2024
npm run demo:seed -- --phase=draft
npm run demo:seed -- --phase=pre-draft --source=synthetic
```

The seeder rebuilds only its own corner: the two pinned invite codes (`DEMO2026`,
`DEMOFREE`), the `@demo.example.com` accounts, and the season's game and stat rows.
It deliberately does not call `resetDb`, because it runs against a long-lived
database that may hold other data.

It also writes the `DemoEnvironment` sentinel row, which is why running it is the
step that makes password sign-in work on a fresh demo database — and why running it
against production is the one thing never to do.

Everything is built through the real domain functions (`createLeague`,
`joinLeague`, `startDraftForLeague`, `autodraftCurrentPick`, `syncWeekStats`), so
the seeded state is always state the app itself could produce.

To advance the playoffs one round, use `/admin` → "Advance mock week", or
`npm run mock:week`. Both default to whichever season the database already holds.

## Deploying (not yet done — see the plan)

A separate Vercel project from this repo, production branch `main`, with its own Neon
database. `VERCEL_ENV=production` there, so `scripts/vercel-build.sh` applies migrations
unchanged. Pointing at `main` rather than a `demo` branch means the demo never drifts
from production and adds no second review surface — the demo is defined entirely by its
environment.

Environment to set on the demo project:

| Variable | Value |
|---|---|
| `DEMO_MODE` | `1` |
| `BETTER_AUTH_URL` | the demo host, which must be on the allowlist in `src/lib/demo-mode.ts` |
| `STATS_PROVIDER` | `fake` |
| `ADMIN_EMAILS` | your email, to reach `/admin` |
| `STRIPE_SECRET_KEY` | test key or blank — **a live key refuses to boot** |
| `RESEND_API_KEY`, `TWILIO_*`, `VAPID_*`, `OPS_ALERT_SLACK_WEBHOOK_URL`, `ODDS_API_KEY` | blank |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | unset |

Then seed it once, which also writes the sentinel row.
