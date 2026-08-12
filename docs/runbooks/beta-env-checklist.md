# December Beta — Vercel Env Checklist (fill-in-the-blanks)

Companion to `production-setup.md`. This is the minimum to get a **working** beta deploy
on the existing Vercel project. Paste these into **Vercel → playoff-best-ball → Settings →
Environment Variables** (Production), or into Doppler `prd` if you're using the sync.

Beta posture (locked 2026-07-13): `STATS_PROVIDER=fake`, Stripe **test** keys, no ads,
placeholder `*.vercel.app` domain.

> ⚠️ **Before setting env, fix the deploy pipeline first.** The Vercel project's last
> deploy was Jan 25, 2026 (old prototype) — the July rebuild never shipped. Reconnect the
> Git integration: **Vercel → playoff-best-ball → Settings → Git → connect
> `Gerner-Ventures/playoff-best-ball`, production branch `main`**. (The repo moved orgs
> since January, which is why pushes stopped auto-deploying.) Once reconnected, a push to
> `main` — or **Deployments → Redeploy** — ships the current code.

---

## 1. Required — the app won't work without these

| Variable | Value to paste |
|---|---|
| `DATABASE_URL` | ⬜ Neon **pooled** string: `postgresql://<user>:<pass>@<host>-pooler.../<db>?sslmode=require` |
| `BETTER_AUTH_SECRET` | ⬜ Generate: `openssl rand -base64 32` (never commit the value; paste it straight into Vercel/Doppler) |
| `BETTER_AUTH_URL` | ⬜ `https://playoff-best-ball.vercel.app` (or whatever prod domain you keep) |
| `RESEND_API_KEY` | ⬜ Resend dashboard key. **Prod throws on every email send without it → nobody can sign in.** |
| `MAGIC_LINK_FROM_EMAIL` | ⬜ *Only if* you don't verify `transactional.playoffbestball.com` in Resend — set an address on a domain you DO control (e.g. `Playoff Best Ball <auth@njgerner.com>`) |
| `NOTIFY_FROM_EMAIL` | ⬜ Same reasoning as above (e.g. `Playoff Best Ball <notify@njgerner.com>`) |
| `STRIPE_SECRET_KEY` | ⬜ Stripe **test** secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | ⬜ From the test-mode webhook endpoint → `https://<app>.vercel.app/api/webhooks/stripe` (events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`) |
| `ADMIN_EMAILS` | ⬜ `hello@njgerner.com` (comma-separate more) — unlocks `/admin` + "Advance mock week" |
| `STATS_PROVIDER` | ✅ `fake` (weeks advance from `/admin`; crons never hit ESPN) |

## 2. Leave UNSET for the beta (documented safe defaults)

- `ODDS_API_KEY` — ⚠️ fake mode does **not** suppress odds sync; a set key would hit The Odds API for real money/quota. Keep empty.
- `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT` — no ads this season.
- `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` — Apple sign-in deferred to launch.
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — **do not set by hand**; the Vercel↔Inngest integration injects them (step 4 of the runbook).

## 3. Optional niceties (set the *pair*, or neither)

| Purpose | Variables |
|---|---|
| Google sign-in | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (setting ID without secret **throws at boot**) |
| SMS "on the clock" | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` (else SMS logs to console) |
| Web push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (**build-time**) + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` — `npx web-push generate-vapid-keys` |
| Analytics | `NEXT_PUBLIC_POSTHOG_KEY` (**build-time**) + `POSTHOG_KEY` — set BOTH pairs or the funnel half-breaks |
| Ops alerts | `OPS_ALERT_SLACK_WEBHOOK_URL` (else sync failures only hit function logs) |

> **Build-time vars** (`NEXT_PUBLIC_*`) are inlined at build. Set them *before* the deploy;
> changing one later needs a **redeploy**, not just an env edit.

## 4. After env is set — order of operations

1. Reconnect Git (banner above) → push `main` or click **Redeploy**.
2. Install the **Vercel ↔ Inngest** integration → first deploy registers 9 functions + 3 crons.
3. Seed the player pool from a local checkout (CLI seeds the checked-in 2026 fixture):
   ```bash
   DATABASE_URL="postgresql://<user>:<pass>@<pooler-host>/<db>?sslmode=require" npx prisma db push
   DATABASE_URL="postgresql://<user>:<pass>@<pooler-host>/<db>?sslmode=require" npx tsx prisma/seed-players-cli.ts
   ```
4. Smoke test: magic-link sign-in → create league → join from 2nd account → draft →
   `/admin` → **Advance mock week** → leaderboard fills. (Full smoke list: runbook §10.)
