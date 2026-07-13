# Production Setup Runbook

One-time operator walkthrough to take playoff-best-ball from a GitHub repo to a live
December beta on Vercel. Work the steps in order — later steps assume the env vars and
integrations from earlier ones.

**Context (decisions locked 2026-07-13):**

- The beta runs on a **placeholder vercel.app domain**; the real product name/domain is
  chosen before the January launch.
- The beta runs `STATS_PROVIDER=fake` (simulated playoffs, advanced from the admin panel)
  and **Stripe test keys** — no real money moves until launch.
- **No ads this season** — leave `NEXT_PUBLIC_ADSENSE_CLIENT`/`NEXT_PUBLIC_ADSENSE_SLOT`
  unset; the ad slot renders nothing.

---

## 1. Neon (Postgres)

1. Create a Neon project named `playoff-best-ball` (region: us-east).
2. Copy the **pooled** connection string (the `-pooler` host) — this becomes `DATABASE_URL`.
3. Initialize the schema from a local checkout:

   ```bash
   DATABASE_URL="postgresql://<user>:<pass>@<pooler-host>/<db>?sslmode=require" npx prisma db push
   ```

> **Tradeoff — `db push`, no migration files:** v1 deliberately uses `prisma db push`
> instead of `prisma migrate` (single developer, single environment). That means there is
> no migration history and no automatic rollback path — schema changes are applied by
> re-running `db push`, which can drop data on destructive changes (Prisma will warn).
> Revisit adopting `prisma migrate` at launch (pre-launch hardening).

## 2. Doppler (secrets)

1. Create a Doppler project `playoff-best-ball` with config `prd` (add `stg` if desired).
2. Load **all** variables from `.env.example` into `prd` with production values (the full
   table is in step 3 below).
3. Install the [Doppler ↔ Vercel integration](https://docs.doppler.com/docs/vercel) and
   sync `prd` → the Vercel project's Production environment, so Vercel env stays in
   lockstep with Doppler.

> **Fallback:** if you skip Doppler for the beta, set the same variables manually in
> Vercel → Project → Settings → Environment Variables. Doppler is the source-of-truth
> convention, not a hard dependency.

## 3. Vercel (hosting)

1. Import the GitHub repo into Vercel. Framework preset: **Next.js** (auto-detected).
   Node version: **24**. No `vercel.json` is needed — Inngest owns all crons.
2. `npm ci` runs `postinstall: prisma generate` automatically, so the Prisma client is
   generated on every fresh Vercel build — no build-command override required.
3. Set the environment variables (via the Doppler sync from step 2, or manually).

> **Build-time NEXT_PUBLIC callout:** every `NEXT_PUBLIC_*` variable is **inlined into
> the client bundle at build time**. Set them *before* triggering a deploy; changing one
> later requires a redeploy (a plain env edit is not enough).

### Required

| Variable | Value / how to get it |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (step 1) |
| `BETTER_AUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The deployment URL — `https://<app>.vercel.app` for the beta |
| `RESEND_API_KEY` | Resend dashboard (step 6). Production **throws** on magic-link/notification sends without it |
| `STRIPE_SECRET_KEY` | Stripe **test** key for the beta (step 5); live key at launch |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe webhook endpoint (step 5) |
| `ADMIN_EMAILS` | Comma-separated operator emails — unlocks `/admin` (case-insensitive match) |

### Optional (each is env-gated; unset = documented default behavior)

| Variable | Build-time? | Unset behavior / notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | runtime | Google sign-in hidden; magic link still works (step 7). Setting the ID without the secret throws at boot |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | runtime | Apple sign-in hidden — **deferred to launch** (step 7) |
| `MAGIC_LINK_FROM_EMAIL` | runtime | Defaults to `Playoff Best Ball <auth@transactional.playoffbestball.com>` (step 6 — placeholder domain!) |
| `NOTIFY_FROM_EMAIL` | runtime | Defaults to `Playoff Best Ball <notify@transactional.playoffbestball.com>` (step 6) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | runtime | SMS notifications log to console instead of sending |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **build** | Push UI shows "unsupported". Generate the pair: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | runtime | Other half of the pair above |
| `VAPID_SUBJECT` | runtime | `mailto:` contact for push, e.g. `mailto:hello@njgerner.com` |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | runtime | Auto-injected by the Vercel ↔ Inngest integration (step 4) — do not set by hand |
| `ODDS_API_KEY` | runtime | Odds sync skips; projections fall back to 0.5 win probability |
| `NEXT_PUBLIC_POSTHOG_KEY` | **build** | Client analytics (pageviews/autocapture) fully off |
| `NEXT_PUBLIC_POSTHOG_HOST` | **build** | Defaults to `https://us.i.posthog.com` |
| `POSTHOG_KEY` | runtime | Server-side event capture (webhooks/crons) silently off |
| `POSTHOG_HOST` | runtime | Defaults to `https://us.i.posthog.com` |
| `OPS_ALERT_SLACK_WEBHOOK_URL` | runtime | Sync-failure alerts go to `console.warn` only |
| `PREMIUM_PRICE_CENTS` | runtime | Defaults to `2500` ($25). Invalid/out-of-range values fall back to the default with a warning. Final price decided at launch |
| `STATS_PROVIDER` | runtime | Unset = ESPN (launch). **Set `fake` for the December beta** — crons never hit ESPN; weeks advance via admin "Advance mock week" |
| `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT` | **build** | Ad slot renders nothing. **Leave unset — no ads this season** |

## 4. Inngest (durable functions & crons)

1. Install the [Vercel ↔ Inngest integration](https://www.inngest.com/docs/deploy/vercel)
   from the Inngest dashboard — it auto-injects `INNGEST_EVENT_KEY` and
   `INNGEST_SIGNING_KEY` into the Vercel project.
2. Trigger the first deploy, then confirm in the Inngest dashboard that the app appears
   with **9 functions**:
   1. `draft-pick-clock`
   2. `draft-notify-on-the-clock`
   3. `draft-notify-complete`
   4. `draft-scheduled-start`
   5. `stats-sync-live`
   6. `stats-sync-daily`
   7. `engagement-cron`
   8. `league-send-recap`
   9. `league-send-preview`
3. Confirm the crons show as scheduled: `stats-sync-live` (every 2 min), `stats-sync-daily`
   (6:00 AM ET), `engagement-cron` (hourly).

## 5. Stripe (premium upgrades)

1. Add a webhook endpoint pointing at `https://<app>.vercel.app/api/webhooks/stripe`
   subscribed to exactly these events (the only ones the handler processes):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
2. Copy the endpoint's signing secret → `STRIPE_WEBHOOK_SECRET`.

> **Beta runs TEST keys:** keep `STRIPE_SECRET_KEY` on a test-mode key (and create the
> webhook endpoint in test mode) until launch. Beta upgrades use Stripe test cards
> (e.g. `4242 4242 4242 4242`) — no real charges. Launch flip: swap to live keys and a
> live-mode webhook endpoint.

## 6. Resend (email)

1. Create the API key → `RESEND_API_KEY`.
2. Verify a sending domain.

> **⚠️ This is the one place the undecided product name bites.** The code's default From
> addresses are `auth@transactional.playoffbestball.com` (magic links) and
> `notify@transactional.playoffbestball.com` (notifications) — a **placeholder** domain.
> For the beta, either verify `transactional.playoffbestball.com` in Resend, or override
> both `MAGIC_LINK_FROM_EMAIL` and `NOTIFY_FROM_EMAIL` with addresses on a domain you
> control and have verified. Unverified From domains = Resend rejects the send = nobody
> can sign in. At launch, swap to the real domain and update/unset both overrides.

## 7. OAuth

- **Google (now):** create an OAuth client in Google Cloud Console with authorized
  JavaScript origin `https://<app>.vercel.app` and redirect URI
  `https://<app>.vercel.app/api/auth/callback/google` → set `GOOGLE_CLIENT_ID` +
  `GOOGLE_CLIENT_SECRET`.
- **Apple (deferred):** requires the paid Apple Developer account; if it isn't ready,
  skip it — magic-link email covers the beta. Set `APPLE_CLIENT_ID` +
  `APPLE_CLIENT_SECRET` at launch.

## 8. PostHog (analytics)

1. Create project `playoff-best-ball` in the **Gerner Ventures** org.
2. Copy the project API key into both pairs:
   - `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (client — **build-time**, set before deploying)
   - `POSTHOG_KEY` + `POSTHOG_HOST` (server — runtime)

## 9. Slack (ops alerts)

1. Create an incoming webhook in the ops channel (Slack app → Incoming Webhooks).
2. Set `OPS_ALERT_SLACK_WEBHOOK_URL`. Sync jobs alert after 3 consecutive failures and
   announce recovery; unset means alerts only reach the Vercel function logs.

## 10. Seed + smoke test

1. **Seed the player pool** from a local checkout (the CLI takes no arguments — it seeds
   the checked-in 2026 fixture, `data/players-2026.json`, idempotently):

   ```bash
   DATABASE_URL="postgresql://<user>:<pass>@<pooler-host>/<db>?sslmode=require" npx tsx prisma/seed-players-cli.ts
   ```

   (Note: `npm run db:seed:players` is the local-dev wrapper — it reads `.env`, so for
   production run the CLI directly with `DATABASE_URL` prefixed as above.)
2. Sign in with a magic link (proves Resend + `BETTER_AUTH_URL`).
3. Create a league, join it from a second account, and run a quick draft.
4. In `/admin` (requires your email in `ADMIN_EMAILS` and `STATS_PROVIDER=fake`), click
   **Advance mock week** — watch the leaderboard fill with week 1 scores.
5. Confirm a recap email arrives within the hour (the hourly `engagement-cron` picks up
   the finalized week).
6. Confirm PostHog shows events (`league_created`, `league_joined`, `draft_completed`,
   pageviews).
7. Test an upgrade with a Stripe test card (`4242 4242 4242 4242`) — the league flips to
   Premium and `upgrade_checkout_started` / `league_upgraded` appear in PostHog.

## 11. December beta checklist

- [ ] 2–4 friend leagues running on `STATS_PROVIDER=fake`
- [ ] Watch Inngest run history + the `SyncHealth` table for failures; Slack alerts wired
- [ ] Advance mock weeks (1–4) on a realistic cadence; confirm recaps/previews land
- [ ] Collect feedback (UX friction, notification volume, dues-interest clicks, premium
      conversion signal from PostHog)

**Launch flip (early January, Phase 6):**

- [ ] Unset `STATS_PROVIDER` (reverts to ESPN real data)
- [ ] Swap Stripe to **live** keys + live-mode webhook endpoint
- [ ] Real domain: update `BETTER_AUTH_URL`, Vercel domain, Google OAuth origins/redirects
- [ ] Resend: verify the real sending domain; update/unset `MAGIC_LINK_FROM_EMAIL` and
      `NOTIFY_FROM_EMAIL`
- [ ] Set the final `PREMIUM_PRICE_CENTS` (decided from beta data)
- [ ] Apple OAuth if the dev account is ready; open signups
