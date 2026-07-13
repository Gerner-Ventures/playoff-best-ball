# Phase 5: Production Deploy & December Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the feature-complete app production-deployable and observable, wire the monetization learning loop (PostHog + dues fake door + config-driven price), and prep the December mock-data beta.

**Architecture:** Code-first, ops-second. Code tasks (1–5) are subagent-executable with TDD: env-driven premium price, an env-gated analytics seam (client pageviews + a small set of server-captured monetization events), the dues-collection fake door on the existing `DuesCollectionInterest` table, consecutive-failure sync alerting to a Slack webhook, and a `STATS_PROVIDER=fake` switch + admin "advance mock week" button so the hosted beta can simulate a playoff run without shell access. Task 6 is docs/config: a production runbook the operator (Nick) walks through once — Vercel, Neon, Doppler, Stripe live, Inngest, Resend, PostHog — plus README/deploy config. Everything new is env-gated and silently off when unconfigured, so dev/test/CI behavior is unchanged.

**Tech Stack:** Existing stack + `posthog-js` / `posthog-node` (the only new runtime deps this phase). No Terraform yet (deferred — see Boundaries).

**Decisions locked (2026-07-13):** beta runs on a placeholder domain (vercel.app subdomain; real name/domain chosen before January launch); premium price is config-driven via `PREMIUM_PRICE_CENTS` (default 2500), final number decided at launch from beta data; **no ads this season** — the AdSense slot stays env-gated off and is not wired further.

**Spec:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md` §4 (hybrid Vercel stack, PostHog, Doppler), §7 (sync alerting after N consecutive failures), §9 (December mock beta, January launch).

**Boundaries (YAGNI):** No Terraform vendor config this phase — one operator, one environment; the runbook documents manual setup and Terraform migration is deferred to pre-launch hardening. No prisma migrate switch — `db push` stays for v1 (single dev, documented in runbook). No load testing automation (game-day load is a manual sanity check during beta). No ad work. No custom-domain/DNS work until the name is chosen.

---

## Conventions (read these files first)

- Services: PrismaClient first arg, `DomainError` codes (src/domain/errors.ts); routes: session → zod → domain → DomainError-to-status mapping (see src/app/api/leagues/[leagueId]/entries/route.ts).
- Env gating pattern: modules export `null`/no-op when their env var is unset and log a dev fallback (see src/lib/notify-email.ts, src/lib/odds/odds-api-provider.ts). Production-throw only where silent failure would lose user-visible messages.
- Inngest: src/inngest/functions.ts — step style, cron format, non-fatal odds step precedent (`try/catch → {skipped, error}`).
- Admin: `ADMIN_EMAILS` gate in src/lib/admin.ts; admin routes under src/app/api/admin/; panel at src/components/admin-panel.tsx.
- Tests: Vitest vs Postgres 5433 via `npm test`, helpers in tests/helpers/db.ts. Current suite: 166 vitest + 6 e2e — keep green. `npm run typecheck`, `npm run lint`, `npm run build` after every task.

---

### Task 1: Config-driven premium price

**Files:**
- Create: `src/lib/pricing.ts`
- Modify: `src/lib/stripe.ts`, `src/app/api/leagues/[leagueId]/upgrade/route.ts` (only if it imports the constant), any UI that displays the price (grep for `$25`, `2500`, `PREMIUM_PRICE`), `.env.example`
- Test: `src/lib/pricing.test.ts`

- [ ] **Step 1: Failing test** — create `src/lib/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePremiumPriceCents, formatPriceUsd } from "./pricing";

describe("parsePremiumPriceCents", () => {
  it("defaults to 2500 when unset or invalid", () => {
    expect(parsePremiumPriceCents(undefined)).toBe(2500);
    expect(parsePremiumPriceCents("")).toBe(2500);
    expect(parsePremiumPriceCents("abc")).toBe(2500);
    expect(parsePremiumPriceCents("25.5")).toBe(2500); // non-integer cents
    expect(parsePremiumPriceCents("50")).toBe(2500); // below sanity floor ($1)
    expect(parsePremiumPriceCents("200000")).toBe(2500); // above sanity ceiling ($1000)
  });

  it("accepts a valid override", () => {
    expect(parsePremiumPriceCents("2000")).toBe(2000);
  });
});

describe("formatPriceUsd", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatPriceUsd(2500)).toBe("$25");
    expect(formatPriceUsd(2050)).toBe("$20.50");
  });
});
```

- [ ] **Step 2: FAIL**, then implement `src/lib/pricing.ts`:

```ts
const DEFAULT_PREMIUM_PRICE_CENTS = 2500;

/** Beta decision (2026-07-13): price is env-driven; the final number is chosen at launch. */
export function parsePremiumPriceCents(raw: string | undefined): number {
  if (!raw) return DEFAULT_PREMIUM_PRICE_CENTS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 100 || n > 100_000) {
    console.warn(`[pricing] ignoring invalid PREMIUM_PRICE_CENTS=${JSON.stringify(raw)}; using default`);
    return DEFAULT_PREMIUM_PRICE_CENTS;
  }
  return n;
}

export const PREMIUM_PRICE_CENTS = parsePremiumPriceCents(process.env.PREMIUM_PRICE_CENTS);

export function formatPriceUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
```

- [ ] **Step 3: Rewire consumers.** Move the price constant out of `src/lib/stripe.ts` (which imports the Stripe SDK — keep pricing importable by server components without pulling the SDK): stripe.ts re-exports or imports `PREMIUM_PRICE_CENTS` from `./pricing`; the upgrade route's `price_data.unit_amount` uses it (likely already does via the constant — just follow the import). Grep the UI for hardcoded price copy (`$25`, `"25"` near premium/upgrade components, the premium teaser, README) and replace displayed prices with `formatPriceUsd(PREMIUM_PRICE_CENTS)` where it's server-rendered. If a CLIENT component hardcodes the price, pass it down as a prop from its server parent — do not read env in client code.

- [ ] **Step 4: .env.example** — add under the Stripe block:

```
# Premium league price in cents (default 2500 = $25). Beta runs the default; final price decided at launch.
PREMIUM_PRICE_CENTS=""
```

- [ ] **Step 5: Gates + commit.** `npm test` (168), typecheck, lint, build.

```bash
git add -A && git commit -m "feat: config-driven premium price via PREMIUM_PRICE_CENTS"
```

---

### Task 2: Analytics seam (PostHog, env-gated)

**Files:**
- Create: `src/lib/analytics-events.ts`, `src/lib/analytics-server.ts`, `src/components/analytics-provider.tsx`
- Modify: `src/app/layout.tsx`, `package.json` (deps: `posthog-js`, `posthog-node`), `.env.example`
- Test: `src/lib/analytics-server.test.ts`

- [ ] **Step 1: Install deps.** `npm install posthog-js posthog-node` (then verify `npm ci --dry-run` still succeeds in a temp dir if lockfile pinning has been an issue — CI uses Node 24/npm 11).

- [ ] **Step 2: Event names** — create `src/lib/analytics-events.ts`:

```ts
/**
 * The monetization-learning event set for the beta season. Deliberately small:
 * funnel = create/join → draft → upgrade; plus the dues-collection fake door.
 * Pageviews come free from posthog-js autocapture.
 */
export const ANALYTICS_EVENTS = {
  LEAGUE_CREATED: "league_created",
  LEAGUE_JOINED: "league_joined",
  DRAFT_COMPLETED: "draft_completed",
  UPGRADE_CHECKOUT_STARTED: "upgrade_checkout_started",
  LEAGUE_UPGRADED: "league_upgraded",
  DUES_INTEREST: "dues_interest",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
```

- [ ] **Step 3: Failing test** — create `src/lib/analytics-server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { captureServerEvent } from "./analytics-server";

describe("captureServerEvent", () => {
  it("is a silent no-op when POSTHOG_KEY is unset", async () => {
    // test env has no POSTHOG_KEY; must resolve without throwing or network I/O
    await expect(
      captureServerEvent("user-1", "league_created", { leagueId: "l1" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: FAIL**, then implement `src/lib/analytics-server.ts`:

```ts
import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./analytics-events";

// Server-side capture for events that must not depend on the browser
// (webhooks, Inngest functions). Env-gated: unset key = silent no-op.
// flushAt 1 / flushInterval 0 so serverless invocations don't drop events.
const key = process.env.POSTHOG_KEY;
const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

const client = key ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 }) : null;

export async function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!client) return;
  try {
    client.capture({ distinctId, event, properties });
    await client.flush();
  } catch (err) {
    console.error("[analytics] capture failed", err); // never let analytics break a request
  }
}
```

(Check the installed posthog-node version's flush API — if `flush()` isn't promise-returning in the installed major, use the documented serverless pattern from its README instead. The contract: event delivered before the serverless invocation ends, silent no-op when unset, never throws.)

- [ ] **Step 5: Client provider** — create `src/components/analytics-provider.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Pageview + autocapture only; explicit client events can use posthog.capture later.
// Env-gated: no key at build time = renders children with no analytics.
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);
  return <>{children}</>;
}
```

Wrap the root layout's children with it in `src/app/layout.tsx` (read the layout first; keep server-component structure — the provider is a client leaf).

- [ ] **Step 6: Server capture call sites.** Wire `captureServerEvent` at:
- league create service call site (the API route, after success): `LEAGUE_CREATED` with `{leagueId}` — distinctId = userId;
- join route: `LEAGUE_JOINED` `{leagueId}`;
- Stripe webhook `handleCheckoutCompleted` success path (the route, after the domain call returns an upgraded league): `LEAGUE_UPGRADED` `{leagueId, amountCents}` — distinctId = the metadata userId (guard: skip capture if missing);
- upgrade route after creating the checkout session: `UPGRADE_CHECKOUT_STARTED` `{leagueId}`;
- Inngest `notifyDraftComplete` (or wherever draft completion is finalized — read it): `DRAFT_COMPLETED` `{leagueId}` with distinctId = the commissioner's userId or `"system"` if awkward — pick what the code makes natural and comment it.
Calls are fire-and-forget (`void captureServerEvent(...)` or awaited — awaited is fine given flushAt 1; in Inngest put it inside a step only if it needs retry, otherwise plain await; do NOT let a capture failure fail the request — the module already guarantees that).

- [ ] **Step 7: .env.example**:

```
# PostHog (optional; unset = analytics fully off)
# Client (build-time, Vercel env): pageviews/autocapture
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
# Server (runtime): webhook/cron event capture
POSTHOG_KEY=""
POSTHOG_HOST="https://us.i.posthog.com"
```

- [ ] **Step 8: Gates + commit.** `npm test` (169), typecheck, lint, build (build must succeed with no PostHog env set).

```bash
git add -A && git commit -m "feat: env-gated PostHog analytics — pageviews + monetization events"
```

---

### Task 3: Dues-collection fake door

**Files:**
- Create: `src/domain/leagues/dues-interest.ts`, `src/app/api/leagues/[leagueId]/dues-interest/route.ts`, `src/components/dues-interest-button.tsx`
- Modify: the league settings page (dues section), `prisma/schema.prisma` ONLY if the existing `DuesCollectionInterest` model is missing fields (read it first — it shipped in an earlier phase unwired)
- Test: `src/domain/leagues/dues-interest.test.ts`

- [ ] **Step 1: Read the schema.** Inspect the `DuesCollectionInterest` model. Expected shape: league + user references and a createdAt; needs a `@@unique([leagueId, userId])` for idempotency — if missing, add it + `npm run db:push && npm run db:push:test && npx prisma generate`, and add its deleteMany to resetDb in tests/helpers/db.ts (before league/user deletes).

- [ ] **Step 2: Failing test** — create `src/domain/leagues/dues-interest.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { recordDuesInterest } from "./dues-interest";
import { NotLeagueMemberError } from "../errors";

describe("recordDuesInterest", () => {
  beforeEach(resetDb);

  it("records once per member, idempotently", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    const first = await recordDuesInterest(testDb, { leagueId: league.id, userId: user.id });
    expect(first.alreadyRecorded).toBe(false);
    const second = await recordDuesInterest(testDb, { leagueId: league.id, userId: user.id });
    expect(second.alreadyRecorded).toBe(true);
    expect(await testDb.duesCollectionInterest.count()).toBe(1);
  });

  it("rejects non-members", async () => {
    const user = await createTestUser();
    const outsider = await createTestUser("Outsider");
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await expect(
      recordDuesInterest(testDb, { leagueId: league.id, userId: outsider.id }),
    ).rejects.toThrow(NotLeagueMemberError);
  });
});
```

(Adapt the model accessor name — `duesCollectionInterest` — to the actual Prisma client name.)

- [ ] **Step 3: FAIL**, then implement `src/domain/leagues/dues-interest.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { NotLeagueMemberError } from "../errors";

/**
 * Fake-door signal for next season's paid dues collection: we record who
 * clicked, build nothing else. Idempotent per (league, user).
 */
export async function recordDuesInterest(
  db: PrismaClient,
  input: { leagueId: string; userId: string },
): Promise<{ alreadyRecorded: boolean }> {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership) throw new NotLeagueMemberError();

  const existing = await db.duesCollectionInterest.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (existing) return { alreadyRecorded: true };
  await db.duesCollectionInterest.create({
    data: { leagueId: input.leagueId, userId: input.userId },
  });
  return { alreadyRecorded: false };
}
```

(Adapt field/unique names to the real model.)

- [ ] **Step 4: Route** — `src/app/api/leagues/[leagueId]/dues-interest/route.ts` (house style): POST, session required (401), `recordDuesInterest`, capture `ANALYTICS_EVENTS.DUES_INTEREST` server event `{leagueId}` only when `alreadyRecorded === false`, DomainError → 404 for NOT_LEAGUE_MEMBER else 409, respond `{ok: true, alreadyRecorded}`.

- [ ] **Step 5: UI.** `src/components/dues-interest-button.tsx` (client, house fetch pattern): copy — heading "Dues collection", body "Want us to collect entry fees from your league next season — no Venmo chasing? We're gauging interest.", button "I'd use this". On success (or `alreadyRecorded`), swap to a "Thanks — noted!" line; persist that state on reload by passing `initialRecorded` from the server parent (query the table for the viewer). Mount in the league settings page's dues/venmo section (read it; place below the existing venmo handle field). Visible to ALL members, not just the commissioner? — commissioners pay dues problems, so settings page (commissioner-only) is the natural v1 spot; mount there and note the narrowing in a comment.

- [ ] **Step 6: Gates + commit.** `npm test` (171), typecheck, lint, build.

```bash
git add -A && git commit -m "feat: dues-collection fake door with interest capture"
```

---

### Task 4: Sync-failure alerting (Slack webhook)

**Files:**
- Create: `src/domain/ops/sync-health.ts`, `src/lib/ops-alert.ts`
- Modify: `prisma/schema.prisma` (SyncHealth model), `tests/helpers/db.ts` (resetDb), `src/inngest/functions.ts` (wire into statsSyncLive + statsSyncDaily + odds step), `.env.example`
- Test: `src/domain/ops/sync-health.test.ts`

- [ ] **Step 1: Schema.** Add:

```prisma
// Consecutive-failure tracking per background job, for ops alerting.
model SyncHealth {
  id                  String    @id @default(cuid())
  job                 String    @unique // "stats-sync-live" | "stats-sync-daily" | "odds-sync"
  consecutiveFailures Int       @default(0)
  lastError           String?
  lastFailureAt       DateTime?
  lastSuccessAt       DateTime?
  alertedAt           DateTime? // set when we alerted for the current failure streak
  updatedAt           DateTime  @updatedAt
}
```

`npm run db:push && npm run db:push:test && npx prisma generate`; add `await testDb.syncHealth.deleteMany();` to resetDb.

- [ ] **Step 2: Failing test** — create `src/domain/ops/sync-health.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { recordSyncOutcome, ALERT_THRESHOLD } from "./sync-health";

describe("recordSyncOutcome", () => {
  beforeEach(resetDb);

  it("alerts once when failures reach the threshold, then stays quiet until recovery", async () => {
    for (let i = 1; i < ALERT_THRESHOLD; i++) {
      const r = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "boom" });
      expect(r.shouldAlert).toBe(false);
    }
    const atThreshold = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "boom" });
    expect(atThreshold.shouldAlert).toBe(true);
    expect(atThreshold.consecutiveFailures).toBe(ALERT_THRESHOLD);

    // further failures do NOT re-alert
    const after = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "boom" });
    expect(after.shouldAlert).toBe(false);

    // success resets and reports recovery (because we had alerted)
    const recovered = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: true });
    expect(recovered.recovered).toBe(true);
    expect(recovered.consecutiveFailures).toBe(0);

    // success after a non-alerted blip is quiet
    await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "blip" });
    const quiet = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: true });
    expect(quiet.recovered).toBe(false);
  });

  it("tracks jobs independently", async () => {
    for (let i = 0; i < ALERT_THRESHOLD; i++) {
      await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "x" });
    }
    const other = await recordSyncOutcome(testDb, { job: "odds-sync", ok: false, error: "y" });
    expect(other.shouldAlert).toBe(false);
    expect(other.consecutiveFailures).toBe(1);
  });
});
```

- [ ] **Step 3: FAIL**, then implement `src/domain/ops/sync-health.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export const ALERT_THRESHOLD = 3; // spec §7: alert after N consecutive provider failures

export interface SyncOutcomeResult {
  consecutiveFailures: number;
  shouldAlert: boolean; // exactly once per failure streak, at the threshold
  recovered: boolean; // success after an alerted streak
}

/** Upsert-style consecutive-failure counter. Alert once per streak; announce recovery once. */
export async function recordSyncOutcome(
  db: PrismaClient,
  input: { job: string; ok: boolean; error?: string },
): Promise<SyncOutcomeResult> {
  const now = new Date();
  const existing = await db.syncHealth.findUnique({ where: { job: input.job } });

  if (input.ok) {
    const recovered = existing?.alertedAt != null;
    await db.syncHealth.upsert({
      where: { job: input.job },
      create: { job: input.job, lastSuccessAt: now },
      update: { consecutiveFailures: 0, alertedAt: null, lastSuccessAt: now, lastError: null },
    });
    return { consecutiveFailures: 0, shouldAlert: false, recovered };
  }

  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  const shouldAlert = failures >= ALERT_THRESHOLD && existing?.alertedAt == null;
  await db.syncHealth.upsert({
    where: { job: input.job },
    create: {
      job: input.job, consecutiveFailures: failures,
      lastError: input.error ?? null, lastFailureAt: now,
      alertedAt: shouldAlert ? now : null,
    },
    update: {
      consecutiveFailures: failures,
      lastError: input.error ?? null, lastFailureAt: now,
      ...(shouldAlert ? { alertedAt: now } : {}),
    },
  });
  return { consecutiveFailures: failures, shouldAlert, recovered: false };
}
```

- [ ] **Step 4: Slack sender** — create `src/lib/ops-alert.ts`:

```ts
// Ops alerts to a Slack incoming webhook. Env-gated: unset = console.warn only.
export async function sendOpsAlert(text: string): Promise<void> {
  const url = process.env.OPS_ALERT_SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn(`[ops-alert] (no webhook configured) ${text}`);
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error(`[ops-alert] slack webhook responded ${res.status}`);
  } catch (err) {
    console.error("[ops-alert] slack webhook failed", err); // alerting must never throw
  }
}
```

- [ ] **Step 5: Wire into Inngest.** In `src/inngest/functions.ts` (read the current step structure first):
- `statsSyncLive`: wrap the existing sync work so the function records ONE outcome per run — success path: `step.run("record-health", () => recordSyncOutcome(db, { job: "stats-sync-live", ok: true }))` then if `recovered`, `sendOpsAlert("✅ stats-sync-live recovered")`; failure path: catch the sync error, record `ok: false` with the message, if `shouldAlert` send `🚨 stats-sync-live has failed N consecutive runs: <error>`, then RETHROW so Inngest retry semantics are unchanged.
- `statsSyncDaily`: same pattern for job "stats-sync-daily" around the week-sync steps.
- The odds step already catches internally and returns `{skipped, error}` — extend it: on caught error also `recordSyncOutcome(db, {job: "odds-sync", ok: false, ...})` + alert on threshold; on success record ok (recovery alert too). Keep it non-fatal.
Alert sends go through `sendOpsAlert` directly (it can't throw); put record+alert inside a `step.run` so retries don't double-count a single run's outcome.

- [ ] **Step 6: .env.example**:

```
# Slack incoming webhook for ops alerts (sync failures). Unset = console only.
OPS_ALERT_SLACK_WEBHOOK_URL=""
```

- [ ] **Step 7: Gates + commit.** `npm test` (173), typecheck, lint, build.

```bash
git add -A && git commit -m "feat: consecutive-failure sync alerting to Slack webhook"
```

---

### Task 5: Beta stats-provider switch + admin mock-week advance

**Files:**
- Read first: how the Inngest crons and admin sync route obtain their StatsProvider today (grep for the ESPN provider import in src/inngest/functions.ts and src/app/api/admin/); `scripts/mock-week.ts`; `src/domain/stats/provider.ts` + the existing FakeStatsProvider used by tests.
- Create: `src/lib/stats-provider.ts` (selection seam), `src/domain/stats/mock-season.ts` (extracted from the script), `src/app/api/admin/mock/advance-week/route.ts`
- Modify: `src/inngest/functions.ts` + admin sync route (use the seam), `scripts/mock-week.ts` (delegate to the extracted domain function), `src/components/admin-panel.tsx` (button), `.env.example`
- Test: `src/domain/stats/mock-season.test.ts`

- [ ] **Step 1: Selection seam** — create `src/lib/stats-provider.ts`:

```ts
// Which StatsProvider the app syncs from. The December beta runs "fake"
// (simulated playoff data, advanced via the admin panel); launch flips to "espn".
```

Export `statsProvider: StatsProvider` chosen by `process.env.STATS_PROVIDER === "fake"` → the fake, else the ESPN provider (the current default import). IMPORTANT: read how the fake provider is constructed in tests — if it requires pre-seeded fixtures, the beta needs a deterministic mock-data source instead: reuse whatever `scripts/mock-week.ts` uses to fabricate stat lines (that script already simulates a week in dev). The CONTRACT: with `STATS_PROVIDER=fake`, crons sync fabricated-but-plausible data for the current mock week and never hit ESPN. Follow the script's existing generation approach — extract, don't invent.

- [ ] **Step 2: Extract mock-week logic (TDD).** Move the meat of `scripts/mock-week.ts` into `src/domain/stats/mock-season.ts` as `advanceMockWeek(db, { season }): Promise<{ week: number; gamesCreated: number; statLines: number }>` — creates/finalizes the next playoff week's NflGames and stat lines exactly as the script does today (read it carefully; preserve its behavior including team assignments and score generation). The script becomes a thin CLI wrapper calling the domain function. Test `src/domain/stats/mock-season.test.ts`: seed a player pool (createStandardPool), call advanceMockWeek → week 1 games exist + FINAL + stat rows exist for pool players; call again → week 2; assert idempotence/progression semantics matching the script's (read first — if the script is generate-once-per-week, calling twice must advance not duplicate). Write the test to pin the ACTUAL extracted behavior, run FAIL first (module missing), implement by extraction, PASS. All existing tests stay green.

- [ ] **Step 3: Admin route + button.** `src/app/api/admin/mock/advance-week/route.ts`: POST, admin-gated exactly like the existing admin sync route (read it — same session + ADMIN_EMAILS check), refuses with 409 unless `process.env.STATS_PROVIDER === "fake"` (mock advancement in a real-data environment would corrupt the season), calls `advanceMockWeek(db, { season: CURRENT_SEASON })`, returns the result. Admin panel gains an "Advance mock week" button (house fetch pattern, shows the returned week/count, only rendered when a `mockMode` prop is true — pass `process.env.STATS_PROVIDER === "fake"` down from the admin page server component).

- [ ] **Step 4: .env.example**:

```
# Stats source: "espn" (default) or "fake" (December beta — simulated playoffs, admin-advanced)
STATS_PROVIDER=""
```

- [ ] **Step 5: Gates + commit.** `npm test` (expect ~175, report actual), typecheck, lint, build. Manual sanity if dev DB is up: `npm run mock:week` still works.

```bash
git add -A && git commit -m "feat: STATS_PROVIDER seam + admin mock-week advance for hosted beta"
```

---

### Task 6: Deploy config, runbook & docs

**Files:**
- Create: `docs/runbooks/production-setup.md`
- Modify: `README.md` (Deploy section), `package.json` (only if a build tweak is needed — see Step 1), `.env.example` (final review pass)

- [ ] **Step 1: Vercel build correctness.** Verify `npm run build` works the way Vercel will run it: `prisma generate` must run before `next build` (locally the postinstall or manual generate covers it — check package.json; if there is no `postinstall: prisma generate`, add it, since Vercel's fresh `npm ci` won't have a generated client). No vercel.json needed (Next.js auto-detected) unless a cron/function config is required — Inngest handles all crons, so it isn't. Confirm build passes from a clean clone: `git clone . /tmp/pbb-clean && cd /tmp/pbb-clean && npm ci && npm run build` (with a dummy DATABASE_URL/BETTER_AUTH_SECRET exported, mirroring CI).

- [ ] **Step 2: Runbook** — create `docs/runbooks/production-setup.md`. Ordered, copy-pasteable operator steps (this is the doc Nick follows once; be concrete, name every env var, mark which are build-time NEXT_PUBLIC):

1. **Neon**: create project `playoff-best-ball` (region us-east), copy pooled connection string → `DATABASE_URL`. Initialize schema: `DATABASE_URL=... npx prisma db push` from a local checkout (document that v1 uses db push, no migration files; risk note + revisit at launch).
2. **Doppler**: create project `playoff-best-ball`, configs `prd` (and `stg` if desired); load ALL vars from .env.example; install the Doppler↔Vercel integration so Vercel env stays synced (document the manual-Vercel-env fallback if Doppler is skipped for beta).
3. **Vercel**: import the GitHub repo, framework Next.js, Node 24; set env vars (via Doppler sync or manually) — list every required var (`DATABASE_URL`, `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`, `BETTER_AUTH_URL` = the vercel.app URL for beta, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_EMAILS`) and every optional one with its default behavior (Twilio, VAPID — generate with `npx web-push generate-vapid-keys`, ODDS_API_KEY, PostHog pair ×2, OPS_ALERT_SLACK_WEBHOOK_URL, PREMIUM_PRICE_CENTS, STATS_PROVIDER=fake for the beta). Note: NEXT_PUBLIC_* are baked at build — set before deploying.
4. **Inngest**: install the Vercel↔Inngest integration (auto-injects INNGEST_EVENT_KEY/INNGEST_SIGNING_KEY); after first deploy, confirm the app appears in the Inngest dashboard with 9 functions and the crons are scheduled.
5. **Stripe**: live mode — add the webhook endpoint `https://<app>/api/webhooks/stripe` (events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`) → `STRIPE_WEBHOOK_SECRET`; keep the beta on TEST keys until launch (document that beta upgrades use test cards).
6. **Resend**: verify the sending domain — placeholder note: defaults are `*@transactional.playoffbestball.com`; for the beta either verify that domain or override `MAGIC_LINK_FROM_EMAIL`/`NOTIFY_FROM_EMAIL` with a domain we control. THIS IS THE ONE PLACE THE UNDECIDED NAME BITES — call it out.
7. **OAuth**: Google client (authorized origin = the vercel.app URL) → env pair; Apple deferred to launch if the paid dev account isn't ready (magic link covers beta) — note both.
8. **PostHog**: create project `playoff-best-ball` in the Gerner Ventures org → both key pairs.
9. **Slack**: create an incoming webhook in the ops channel → `OPS_ALERT_SLACK_WEBHOOK_URL`.
10. **Seed + smoke**: seed the player pool (`DATABASE_URL=... npm run db:seed:players -- --season 2026` — check the CLI's actual args and document exactly), create a league, run an admin "Advance mock week", watch the leaderboard fill, confirm a recap email arrives within the hour, confirm PostHog shows events, test an upgrade with a Stripe test card.
11. **Beta checklist** (December): 2–4 friend leagues on `STATS_PROVIDER=fake`; watch Inngest runs + SyncHealth; collect feedback; launch flip = `STATS_PROVIDER` unset + Stripe live keys + real domain + Resend domain swap.

- [ ] **Step 3: README.** Add a short "Deploying" section pointing at the runbook; document the new env vars (pricing, PostHog, ops alert, STATS_PROVIDER) in the existing env tables/sections; note "no ads this season" next to the AdSense section (kept env-gated off).

- [ ] **Step 4: Gates + commit.** Full sweep: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e` (expect ~175 vitest + 6 e2e — report actual).

```bash
git add -A && git commit -m "docs: production runbook, deploy config, README deploy section"
```

---

## Deferred (explicit)

- **Launch (Phase 6, early Jan 2027):** real domain + DNS, Resend domain swap, Stripe live keys, `STATS_PROVIDER` → espn, final price decision (from beta data), open signups
- Terraform for vendor config (Stripe product, PostHog, DNS) — manual for beta, revisit at launch
- `prisma migrate` adoption (db push documented as v1 tradeoff)
- Ads (decided: none this season); Apple OAuth if dev account not ready; load-test automation
- Product name/domain brainstorm (before launch; placeholder vercel.app for beta)
