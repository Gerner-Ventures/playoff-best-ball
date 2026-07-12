# Phase 4A: Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The revenue loop — Stripe premium upgrades wired to the existing monetization gates, the free-tier ad slot, dues tracking with Venmo handoff, the dues-collection fake door, and the premium custom-scoring editor.

**Architecture:** Premium is a per-league one-time purchase ($25/season) via Stripe hosted Checkout with inline `price_data` (no dashboard products to manage); the `checkout.session.completed` webhook is the source of truth and drives an idempotent `upgradeLeaguePremium` (tier flip + `maxEntries` bump to 25). The Phase 1 gates already return 402 `PREMIUM_REQUIRED` / 409 `LEAGUE_FULL` — this phase attaches upgrade CTAs to them and relaxes `createLeague` for premium commissioners. Dues stay outside the system per the spec: tracking + Venmo links only, with the "collect automatically" fake door measuring willingness-to-pay. Scoring changes recompute standings automatically (compute-at-read from Phase 3), so the custom-scoring editor needs no recalc machinery.

**Tech Stack:** Existing stack + `stripe` SDK. Same env conventions: missing Stripe keys → 501 with a clear message (billing simply off in dev); ad slot renders a dev placeholder without `NEXT_PUBLIC_ADSENSE_CLIENT`.

**Spec:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md` (§2 monetization/gates, §6 money flows)

**Boundaries (YAGNI / Phase 4B):** No weekly recaps/previews, no elimination/clinch tracking, no projections/odds/props analytics, no substitutions scoring, no multiple-entries-per-person UI (premium data model supports it; join flow stays one-entry), no Stripe customer portal (one-time payments), no refunds UI (Stripe dashboard suffices at this scale). Ad network final choice is an open spec item — this phase ships the mount point wired for AdSense.

---

## Conventions (read these files first)

- Domain: PrismaClient first arg, typed `DomainError`s with `.code`, routes map codes → statuses (`src/domain/errors.ts`, `src/app/api/leagues/route.ts`).
- Settings JSON: read ONLY via `parseLeagueSettings`/`tryParseLeagueSettings`; adding OPTIONAL fields with zod defaults does NOT need a `settingsVersion` bump (old rows parse via defaults).
- Gates today: `createLeague` throws `FreeLeagueLimitError` (402) on a second free league; `joinLeague` throws `LeagueFullError` (409) at `settings.maxEntries`.
- UI: server components + small client islands, Tailwind, green-700 primaries, fetch with try/catch + busy/error states (`src/components/create-league-form.tsx` is the canonical form pattern).
- Tests: Vitest vs Postgres 5433, helpers in `tests/helpers/db.ts`, TDD. Current suite: 118 vitest + 4 e2e — keep green.

---

### Task 1: Schema — LeaguePurchase, DuesCollectionInterest, Entry.duesPaid, settings.venmoHandle

**Files:**
- Modify: `prisma/schema.prisma`, `src/domain/league-settings.ts`, `tests/helpers/db.ts`
- Test: `src/domain/league-settings.test.ts` (one assertion added)

- [ ] **Step 1: Schema additions.** Append to `prisma/schema.prisma`:

```prisma
enum PurchaseStatus {
  COMPLETED
  REFUNDED // set manually via Stripe dashboard ops for now
}

model LeaguePurchase {
  id              String         @id @default(cuid())
  league          League         @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  leagueId        String
  purchasedById   String // userId; not a relation — purchases outlive membership changes
  stripeSessionId String         @unique // idempotency key for webhook retries
  amountCents     Int
  status          PurchaseStatus @default(COMPLETED)
  createdAt       DateTime       @default(now())

  @@index([leagueId])
}

model DuesCollectionInterest {
  id        String   @id @default(cuid())
  league    League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  leagueId  String
  userId    String
  createdAt DateTime @default(now())

  @@unique([leagueId, userId]) // one waitlist signup per commissioner per league
}
```

On `Entry`, add `duesPaid Boolean @default(false) // commissioner-toggled; money never touches us`. On `League`, add back-relations `purchases LeaguePurchase[]` and `duesInterest DuesCollectionInterest[]`.

- [ ] **Step 2: Push + generate.** `npm run db:push && npm run db:push:test && npx prisma generate`

- [ ] **Step 3: settings.venmoHandle.** In `src/domain/league-settings.ts`, add to `leagueSettingsSchema` (after `entryFeeCents`):

```ts
  /** Where members send dues (display only). No version bump: optional w/ default. */
  venmoHandle: z.string().max(40).nullable().default(null),
```

Add `venmoHandle: null,` to `buildDefaultSettings`'s return. Add one assertion to the `buildDefaultSettings` test: `expect(settings.venmoHandle).toBeNull();` and one proving old JSON parses: in the round-trip test file add

```ts
  it("parses pre-4A settings JSON (no venmoHandle) via the default", () => {
    const legacy = { ...buildDefaultSettings("standard", 8) } as Record<string, unknown>;
    delete legacy.venmoHandle;
    expect(leagueSettingsSchema.parse(legacy).venmoHandle).toBeNull();
  });
```

- [ ] **Step 4: resetDb.** In `tests/helpers/db.ts`, add `await testDb.duesCollectionInterest.deleteMany();` and `await testDb.leaguePurchase.deleteMany();` before the league delete.

- [ ] **Step 5: Gates + commit.** `npm test` (120) + tsc + lint.

```bash
git add -A && git commit -m "feat: schema for purchases, dues interest, dues tracking, venmo handle"
```

---

### Task 2: Premium domain — upgrade service + gate relaxation

**Files:**
- Create: `src/domain/leagues/upgrade-league.ts`
- Modify: `src/domain/leagues/create-league.ts`, `src/domain/errors.ts`
- Test: `src/domain/leagues/upgrade-league.test.ts`, `src/domain/leagues/create-league.test.ts` (one test added)

- [ ] **Step 1: Error + constant.** Append to `src/domain/errors.ts`:

```ts
export class PremiumFeatureError extends DomainError {
  constructor(feature: string) {
    super(`${feature} is a Premium feature. Upgrade this league to unlock it.`, "PREMIUM_REQUIRED");
  }
}
```

- [ ] **Step 2: Failing test** — create `src/domain/leagues/upgrade-league.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { upgradeLeaguePremium, PREMIUM_MAX_ENTRIES } from "./upgrade-league";
import { parseLeagueSettings } from "../league-settings";

describe("upgradeLeaguePremium", () => {
  beforeEach(resetDb);

  it("flips tier and raises maxEntries", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    const upgraded = await upgradeLeaguePremium(testDb, { leagueId: league.id });
    expect(upgraded.tier).toBe("PREMIUM");
    expect(parseLeagueSettings(upgraded.settings).maxEntries).toBe(PREMIUM_MAX_ENTRIES);
  });

  it("is idempotent and never lowers a raised cap", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await upgradeLeaguePremium(testDb, { leagueId: league.id });
    const again = await upgradeLeaguePremium(testDb, { leagueId: league.id });
    expect(again.tier).toBe("PREMIUM");
    expect(parseLeagueSettings(again.settings).maxEntries).toBe(PREMIUM_MAX_ENTRIES);
  });
});
```

- [ ] **Step 3: FAIL**, then implement — create `src/domain/leagues/upgrade-league.ts`:

```ts
import { Prisma, type PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "../league-settings";

export const PREMIUM_MAX_ENTRIES = 25;

type Db = PrismaClient | Prisma.TransactionClient;

/** Idempotent premium flip: tier + entry-cap raise. Callable inside the webhook transaction. */
export async function upgradeLeaguePremium(db: Db, input: { leagueId: string }) {
  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  if (league.tier === "PREMIUM") return league;
  const settings = parseLeagueSettings(league.settings);
  settings.maxEntries = Math.max(settings.maxEntries, PREMIUM_MAX_ENTRIES);
  return db.league.update({
    where: { id: input.leagueId },
    data: { tier: "PREMIUM", settings: settings as Prisma.InputJsonValue },
  });
}
```

- [ ] **Step 4: Gate relaxation (TDD).** Add to `src/domain/leagues/create-league.test.ts`:

```ts
  it("premium commissioners may run additional leagues", async () => {
    const user = await createTestUser();
    const first = await createLeague(testDb, {
      userId: user.id, name: "First", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await upgradeLeaguePremium(testDb, { leagueId: first.id });
    await expect(
      createLeague(testDb, {
        userId: user.id, name: "Second", teamName: "T2",
        scoringPreset: "standard", pickClockHours: 8,
      }),
    ).resolves.toBeTruthy();
  });
```

(import upgradeLeaguePremium). Run → FAIL. Then in `src/domain/leagues/create-league.ts`, wrap the free-count check:

```ts
  // "Multiple leagues per commissioner" is a premium benefit: buying Premium for
  // any league this season unlocks creating more.
  const premiumCount = await db.league.count({
    where: {
      season: CURRENT_SEASON,
      tier: "PREMIUM",
      memberships: { some: { userId: input.userId, role: "COMMISSIONER" } },
    },
  });
  if (premiumCount === 0) {
    const existingFree = await db.league.count({ /* unchanged existing query */ });
    if (existingFree >= 1) throw new FreeLeagueLimitError();
  }
```

All existing create-league tests must stay green.

- [ ] **Step 5: Gates + commit.** `npm test` (123).

```bash
git add -A && git commit -m "feat: premium upgrade service and multi-league gate relaxation"
```

---

### Task 3: Stripe checkout — client + upgrade route

**Files:**
- Create: `src/lib/stripe.ts`, `src/app/api/leagues/[leagueId]/upgrade/route.ts`
- Modify: `package.json` (dep), `.env.example`

- [ ] **Step 1: Install + client.**

```bash
npm install stripe
```

Create `src/lib/stripe.ts`:

```ts
import Stripe from "stripe";

// Missing key = billing off (dev default). Routes answer 501 with a clear message.
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey ? new Stripe(secretKey) : null;

export const PREMIUM_PRICE_CENTS = 2500; // ~$25/league/season per the spec (open item: exact price)
```

- [ ] **Step 2: Upgrade route** — create `src/app/api/leagues/[leagueId]/upgrade/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { stripe, PREMIUM_PRICE_CENTS } from "@/lib/stripe";

type Params = { params: Promise<{ leagueId: string }> };

const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** Starts a Stripe Checkout for the league's premium upgrade. Webhook completes it. */
export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership || membership.role !== "COMMISSIONER") {
    return NextResponse.json({ error: "Only the commissioner can upgrade" }, { status: 403 });
  }
  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });
  if (league.tier === "PREMIUM") {
    return NextResponse.json({ error: "Already premium", code: "ALREADY_PREMIUM" }, { status: 409 });
  }
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing isn't configured on this server." },
      { status: 501 },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PREMIUM_PRICE_CENTS,
          product_data: {
            name: `Premium League — ${league.name} (${league.season} playoffs)`,
          },
        },
      },
    ],
    metadata: { leagueId: league.id, userId: user.id },
    success_url: `${APP_URL}/leagues/${league.id}?upgraded=1`,
    cancel_url: `${APP_URL}/leagues/${league.id}?upgrade=cancelled`,
  });
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 3: Env docs.** `.env.example`, new section:

```
# Stripe (premium league upgrades). Empty = billing off; upgrade routes answer 501.
# Test keys from https://dashboard.stripe.com/test/apikeys; webhook secret from
# `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
```

- [ ] **Step 4: Manual verification.** Without keys: signed-in commissioner POST /upgrade → 501; non-commissioner → 403; unauthenticated → 401. (With test keys, optional: response contains a checkout.stripe.com URL.) Gates: tsc/lint/test (123)/build.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat: stripe checkout for premium league upgrades"
```

---

### Task 4: Stripe webhook — completion handler

**Files:**
- Create: `src/domain/leagues/handle-checkout.ts`, `src/app/api/webhooks/stripe/route.ts`
- Test: `src/domain/leagues/handle-checkout.test.ts`

- [ ] **Step 1: Failing test** — create `src/domain/leagues/handle-checkout.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { handleCheckoutCompleted } from "./handle-checkout";
import { PREMIUM_MAX_ENTRIES } from "./upgrade-league";
import { parseLeagueSettings } from "../league-settings";

describe("handleCheckoutCompleted", () => {
  beforeEach(resetDb);

  async function setup() {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    return { user, league };
  }

  it("records the purchase and upgrades the league atomically", async () => {
    const { user, league } = await setup();
    const purchase = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_test_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    expect(purchase.amountCents).toBe(2500);
    const updated = await testDb.league.findUniqueOrThrow({ where: { id: league.id } });
    expect(updated.tier).toBe("PREMIUM");
    expect(parseLeagueSettings(updated.settings).maxEntries).toBe(PREMIUM_MAX_ENTRIES);
  });

  it("is idempotent on webhook retries (same session id)", async () => {
    const { user, league } = await setup();
    const first = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_test_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    const retry = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_test_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    expect(retry.id).toBe(first.id);
    expect(await testDb.leaguePurchase.count()).toBe(1);
  });

  it("rejects sessions with missing league metadata", async () => {
    const { user } = await setup();
    await expect(
      handleCheckoutCompleted(testDb, {
        sessionId: "cs_test_2", leagueId: "", userId: user.id, amountCents: 2500,
      }),
    ).rejects.toThrow(/missing leagueId/i);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/leagues/handle-checkout.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { upgradeLeaguePremium } from "./upgrade-league";

export interface CheckoutCompletedInput {
  sessionId: string;
  leagueId: string;
  userId: string;
  amountCents: number;
}

/**
 * Source of truth for premium: called by the Stripe webhook. Idempotent by
 * stripeSessionId (Stripe retries webhooks); purchase + upgrade are atomic.
 */
export async function handleCheckoutCompleted(db: PrismaClient, input: CheckoutCompletedInput) {
  if (!input.leagueId) throw new Error("checkout session missing leagueId metadata");
  const existing = await db.leaguePurchase.findUnique({
    where: { stripeSessionId: input.sessionId },
  });
  if (existing) return existing;

  return db.$transaction(async (tx) => {
    const purchase = await tx.leaguePurchase.create({
      data: {
        leagueId: input.leagueId,
        purchasedById: input.userId,
        stripeSessionId: input.sessionId,
        amountCents: input.amountCents,
      },
    });
    await upgradeLeaguePremium(tx, { leagueId: input.leagueId });
    return purchase;
  });
}
```

- [ ] **Step 3: Webhook route** — create `src/app/api/webhooks/stripe/route.ts`:

```ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/domain/leagues/handle-checkout";

/** Stripe calls this; signature verification is the only auth. */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Billing isn't configured" }, { status: 501 });
  }
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await handleCheckoutCompleted(db, {
      sessionId: session.id,
      leagueId: session.metadata?.leagueId ?? "",
      userId: session.metadata?.userId ?? "",
      amountCents: session.amount_total ?? 0,
    });
  }
  return NextResponse.json({ received: true });
}
```

(If the installed stripe SDK types need `event.data.object as Stripe.Checkout.Session`, add the cast — verify against the installed version.)

- [ ] **Step 4: Gates + commit.** `npm test` (126), tsc, lint, build. Manual: POST /api/webhooks/stripe without config → 501; with garbage body + fake secret set → 400.

```bash
git add -A && git commit -m "feat: stripe webhook completes premium upgrades idempotently"
```

---

### Task 5: Upgrade CTAs — league page + gate responses

**Files:**
- Create: `src/components/upgrade-button.tsx`
- Modify: `src/app/leagues/[leagueId]/page.tsx`, `src/components/create-league-form.tsx`, `src/app/join/[code]/page.tsx`

- [ ] **Step 1: Upgrade button (client).** Create `src/components/upgrade-button.tsx`:

```tsx
"use client";

import { useState } from "react";

export function UpgradeButton({ leagueId }: { leagueId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/upgrade`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        window.location.assign(body.url); // off to Stripe Checkout
        return;
      }
      setError(body.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={upgrade}
        disabled={busy}
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "One sec…" : "Upgrade to Premium — $25"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 2: League page.** In `src/app/leagues/[leagueId]/page.tsx` (read it):
- Show a tier chip next to the header meta line: `{league.tier === "PREMIUM" && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PREMIUM</span>}`.
- For the commissioner of a FREE league, render `<UpgradeButton leagueId={league.id} />` under the header block with a one-line benefits note: `Custom scoring, up to 25 teams, more leagues, no ads.`
- Handle the return-from-checkout state: the page receives `searchParams` — when `upgraded=1` and the league is still FREE (webhook lag), render a gray note `Payment received — premium activates in a few seconds; refresh if it doesn't.`; when PREMIUM, nothing extra (the chip shows it). Add `searchParams: Promise<{ upgraded?: string }>` to the page props and await it.

- [ ] **Step 3: Gate CTAs.**
- `src/components/create-league-form.tsx`: when the API responds 402 with `code: "PREMIUM_REQUIRED"`, append to the error display a link: `<a href="/dashboard" className="underline">Upgrade one of your leagues to Premium to run more.</a>` — simplest: extend the error state to `{message, premium?: boolean}` and render the hint line when premium. (Read the file; keep its patterns.)
- `src/app/join/[code]/page.tsx`: the league-full message already tells joiners the commissioner can upgrade — no change needed; VERIFY the copy still matches and move on.

- [ ] **Step 4: Manual verification.** Dev (no Stripe keys): commissioner sees the upgrade button; clicking → error line "Billing isn't configured on this server." (proves the wiring); member sees no button; premium chip absent on free league. Optionally flip a league to PREMIUM via psql and confirm the chip + button disappearing.

- [ ] **Step 5: Gates + commit.**

```bash
git add -A && git commit -m "feat: premium upgrade CTAs and tier chip"
```

---

### Task 6: League settings service + page (scoring editor, dues config)

**Files:**
- Create: `src/domain/leagues/update-settings.ts`, `src/app/leagues/[leagueId]/settings/page.tsx`, `src/components/league-settings-form.tsx`, `src/app/api/leagues/[leagueId]/settings/route.ts`
- Test: `src/domain/leagues/update-settings.test.ts`
- Modify: `src/app/leagues/[leagueId]/page.tsx` (settings link)

- [ ] **Step 1: Failing test** — create `src/domain/leagues/update-settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { upgradeLeaguePremium } from "./upgrade-league";
import { updateLeagueSettings } from "./update-settings";
import { parseLeagueSettings, SCORING_PRESETS } from "../league-settings";
import { NotCommissionerError, PremiumFeatureError } from "../errors";

async function setup() {
  const user = await createTestUser();
  const league = await createLeague(testDb, {
    userId: user.id, name: "L", teamName: "T",
    scoringPreset: "standard", pickClockHours: 8,
  });
  return { user, league };
}

describe("updateLeagueSettings", () => {
  beforeEach(resetDb);

  it("commissioner switches presets on a free league", async () => {
    const { user, league } = await setup();
    const updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, scoringPreset: "full_ppr",
    });
    const settings = parseLeagueSettings(updated.settings);
    expect(settings.scoringPreset).toBe("full_ppr");
    expect(settings.scoring.ppr).toBe(1);
  });

  it("custom scoring values require premium", async () => {
    const { user, league } = await setup();
    const custom = { ...SCORING_PRESETS.standard, passTd: 4 };
    await expect(
      updateLeagueSettings(testDb, { leagueId: league.id, userId: user.id, scoring: custom }),
    ).rejects.toThrow(PremiumFeatureError);

    await upgradeLeaguePremium(testDb, { leagueId: league.id });
    const updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, scoring: custom,
    });
    const settings = parseLeagueSettings(updated.settings);
    expect(settings.scoringPreset).toBe("custom");
    expect(settings.scoring.passTd).toBe(4);
    expect(settings.maxEntries).toBe(25); // untouched premium cap
  });

  it("saves dues config on any tier and clears with nulls", async () => {
    const { user, league } = await setup();
    let updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, entryFeeCents: 5000, venmoHandle: "nick-gerner",
    });
    let settings = parseLeagueSettings(updated.settings);
    expect(settings.entryFeeCents).toBe(5000);
    expect(settings.venmoHandle).toBe("nick-gerner");

    updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, entryFeeCents: null, venmoHandle: null,
    });
    settings = parseLeagueSettings(updated.settings);
    expect(settings.entryFeeCents).toBeNull();
    expect(settings.venmoHandle).toBeNull();
  });

  it("rejects non-commissioners", async () => {
    const { league } = await setup();
    const other = await createTestUser();
    await expect(
      updateLeagueSettings(testDb, {
        leagueId: league.id, userId: other.id, scoringPreset: "half_ppr",
      }),
    ).rejects.toThrow(NotCommissionerError);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/leagues/update-settings.ts`:

```ts
import { Prisma, type PrismaClient } from "@prisma/client";
import { NotCommissionerError, PremiumFeatureError } from "../errors";
import {
  parseLeagueSettings,
  SCORING_PRESETS,
  type ScoringPresetName,
  type ScoringSettings,
} from "../league-settings";

export interface UpdateLeagueSettingsInput {
  leagueId: string;
  userId: string;
  /** Free tier: switch presets. Ignored when `scoring` is provided. */
  scoringPreset?: ScoringPresetName;
  /** Premium only: full custom values (sets scoringPreset to "custom"). */
  scoring?: ScoringSettings;
  /** undefined = leave unchanged; null = clear. */
  entryFeeCents?: number | null;
  venmoHandle?: string | null;
}

/**
 * Commissioner settings updates. Scoring changes recompute standings automatically
 * (points are computed at read) — the UI warns about mid-season changes; we don't block them.
 */
export async function updateLeagueSettings(db: PrismaClient, input: UpdateLeagueSettingsInput) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();

  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  const settings = parseLeagueSettings(league.settings);

  if (input.scoring) {
    if (league.tier !== "PREMIUM") throw new PremiumFeatureError("Custom scoring");
    settings.scoring = { ...input.scoring };
    settings.scoringPreset = "custom";
  } else if (input.scoringPreset) {
    settings.scoring = { ...SCORING_PRESETS[input.scoringPreset] };
    settings.scoringPreset = input.scoringPreset;
  }
  if (input.entryFeeCents !== undefined) settings.entryFeeCents = input.entryFeeCents;
  if (input.venmoHandle !== undefined) settings.venmoHandle = input.venmoHandle;

  return db.league.update({
    where: { id: input.leagueId },
    data: { settings: settings as Prisma.InputJsonValue },
  });
}
```

- [ ] **Step 3: API route** — create `src/app/api/leagues/[leagueId]/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { updateLeagueSettings } from "@/domain/leagues/update-settings";
import { DomainError } from "@/domain/errors";
import { scoringPresetNameSchema, scoringSettingsSchema } from "@/domain/league-settings";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({
  scoringPreset: scoringPresetNameSchema.optional(),
  scoring: scoringSettingsSchema.optional(),
  entryFeeCents: z.number().int().nonnegative().max(100_000_00).nullable().optional(),
  venmoHandle: z.string().trim().min(1).max(40).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const league = await updateLeagueSettings(db, { leagueId, userId: user.id, ...parsed.data });
    return NextResponse.json({ ok: true, tier: league.tier });
  } catch (err) {
    if (err instanceof DomainError) {
      const status =
        err.code === "NOT_COMMISSIONER" ? 403 : err.code === "PREMIUM_REQUIRED" ? 402 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Settings page + form.** Create `src/app/leagues/[leagueId]/settings/page.tsx` (server: session redirect w/ callbackURL, COMMISSIONER-only — non-commissioner members get `notFound()`; loads league + settings via `tryParseLeagueSettings` with the standard graceful block on null; renders AppNav, heading `League settings`, tier chip, `<UpgradeButton>` when FREE, and the form):

```tsx
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { tryParseLeagueSettings } from "@/domain/league-settings";
import { AppNav } from "@/components/app-nav";
import { UpgradeButton } from "@/components/upgrade-button";
import { LeagueSettingsForm } from "@/components/league-settings-form";

export default async function LeagueSettingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/settings`);
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership || membership.role !== "COMMISSIONER") notFound();

  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { duesInterest: { where: { userId: user.id }, select: { id: true } } },
  });
  const settings = tryParseLeagueSettings(league.settings);
  if (!settings) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Something&apos;s wrong with this league</h1>
        <p className="mt-2 text-gray-600">Ask your commissioner to contact support.</p>
      </main>
    );
  }

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">League settings</h1>
          {league.tier === "PREMIUM" ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PREMIUM</span>
          ) : (
            <UpgradeButton leagueId={league.id} />
          )}
        </div>
        <LeagueSettingsForm
          leagueId={league.id}
          isPremium={league.tier === "PREMIUM"}
          initial={{
            scoringPreset: settings.scoringPreset,
            scoring: settings.scoring,
            entryFeeCents: settings.entryFeeCents,
            venmoHandle: settings.venmoHandle,
          }}
          duesInterestJoined={league.duesInterest.length > 0}
        />
      </main>
    </>
  );
}
```

Create `src/components/league-settings-form.tsx` (client). Structure — one form, three sections, one Save button, plus the fake-door section (wired in Task 8's API; render it here now with the POST call):

```tsx
"use client";

import { useState } from "react";
import type { ScoringSettings } from "@/domain/league-settings";

interface Props {
  leagueId: string;
  isPremium: boolean;
  initial: {
    scoringPreset: string;
    scoring: ScoringSettings;
    entryFeeCents: number | null;
    venmoHandle: string | null;
  };
  duesInterestJoined: boolean;
}

const PRESETS = [
  { value: "standard", label: "Standard" },
  { value: "half_ppr", label: "Half PPR" },
  { value: "full_ppr", label: "Full PPR" },
] as const;

// Human labels for the custom grid, grouped for scanability.
const SCORING_GROUPS: { title: string; fields: [keyof ScoringSettings, string][] }[] = [
  {
    title: "Passing",
    fields: [["passYardsPerPoint", "Yards per point"], ["passTd", "TD"], ["passInt", "INT"]],
  },
  {
    title: "Rushing / Receiving",
    fields: [
      ["rushYardsPerPoint", "Rush yds/pt"], ["rushTd", "Rush TD"],
      ["recYardsPerPoint", "Rec yds/pt"], ["recTd", "Rec TD"], ["ppr", "Per reception"],
    ],
  },
  {
    title: "Kicking",
    fields: [
      ["fg0_19", "FG 0–19"], ["fg20_29", "FG 20–29"], ["fg30_39", "FG 30–39"],
      ["fg40_49", "FG 40–49"], ["fg50Plus", "FG 50+"], ["fgMiss", "FG miss"],
      ["xpMade", "XP"], ["xpMiss", "XP miss"],
    ],
  },
  {
    title: "Defense",
    fields: [
      ["sack", "Sack"], ["defInt", "INT"], ["fumRec", "Fumble rec"], ["dstTd", "DST TD"],
      ["safety", "Safety"], ["block", "Block"],
      ["pa0", "0 PA"], ["pa1_6", "1–6 PA"], ["pa7_13", "7–13 PA"], ["pa14_20", "14–20 PA"],
      ["pa21_27", "21–27 PA"], ["pa28_34", "28–34 PA"], ["pa35Plus", "35+ PA"],
    ],
  },
  {
    title: "Misc",
    fields: [["twoPtConv", "2-pt conv"], ["fumbleLost", "Fumble lost"], ["returnTd", "Return TD"]],
  },
];

export function LeagueSettingsForm({ leagueId, isPremium, initial, duesInterestJoined }: Props) {
  const [preset, setPreset] = useState(initial.scoringPreset);
  const [scoring, setScoring] = useState<ScoringSettings>(initial.scoring);
  const [customized, setCustomized] = useState(false);
  const [fee, setFee] = useState(initial.entryFeeCents !== null ? String(initial.entryFeeCents / 100) : "");
  const [venmo, setVenmo] = useState(initial.venmoHandle ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interestJoined, setInterestJoined] = useState(duesInterestJoined);
  const [interestBusy, setInterestBusy] = useState(false);

  function setScoringField(key: keyof ScoringSettings, value: number) {
    setScoring((s) => ({ ...s, [key]: value }));
    setCustomized(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const feeCents = fee.trim() === "" ? null : Math.round(Number(fee) * 100);
    if (feeCents !== null && (!Number.isFinite(feeCents) || feeCents < 0)) {
      setError("Entry fee must be a dollar amount.");
      setBusy(false);
      return;
    }
    const body: Record<string, unknown> = {
      entryFeeCents: feeCents,
      venmoHandle: venmo.trim() === "" ? null : venmo.trim(),
    };
    if (customized && isPremium) body.scoring = scoring;
    else if (preset !== initial.scoringPreset && preset !== "custom") body.scoringPreset = preset;
    try {
      const res = await fetch(`/api/leagues/${leagueId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        setCustomized(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    setInterestBusy(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/dues-interest`, { method: "POST" });
      if (res.ok) setInterestJoined(true);
    } finally {
      setInterestBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="font-semibold">Scoring</h2>
        <p className="mt-1 text-sm text-gray-500">
          Changes apply to all weeks immediately — standings recompute from raw stats.
        </p>
        <div className="mt-2 flex gap-3">
          {PRESETS.map((p) => (
            <label key={p.value} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="preset"
                checked={preset === p.value && !customized}
                onChange={() => {
                  setPreset(p.value);
                  setCustomized(false);
                }}
              />
              {p.label}
            </label>
          ))}
          {(preset === "custom" || customized) && (
            <span className="text-sm font-medium text-amber-700">Custom</span>
          )}
        </div>
        <div className={`mt-4 ${isPremium ? "" : "pointer-events-none opacity-50"}`}>
          {SCORING_GROUPS.map((group) => (
            <fieldset key={group.title} className="mt-3">
              <legend className="text-sm font-medium text-gray-600">{group.title}</legend>
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {group.fields.map(([key, label]) => (
                  <label key={key} className="flex flex-col text-xs text-gray-500">
                    {label}
                    <input
                      type="number"
                      step="any"
                      value={scoring[key]}
                      onChange={(e) => setScoringField(key, Number(e.target.value))}
                      className="rounded border px-2 py-1 text-sm text-gray-900"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {!isPremium && (
          <p className="mt-2 text-sm text-amber-700">
            Editing individual values is a Premium feature — presets are free.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Dues (handled outside the app)</h2>
        <p className="mt-1 text-sm text-gray-500">
          We never touch the money — this just helps you track who&apos;s paid.
        </p>
        <div className="mt-2 flex gap-4">
          <label className="flex flex-col text-sm text-gray-600">
            Entry fee ($)
            <input
              type="number"
              min="0"
              step="1"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="50"
              className="w-28 rounded-lg border px-3 py-2 text-gray-900"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-600">
            Venmo handle
            <input
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
              placeholder="your-venmo"
              className="w-48 rounded-lg border px-3 py-2 text-gray-900"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-dashed p-4">
        <h2 className="font-semibold">Automatic dues collection</h2>
        <p className="mt-1 text-sm text-gray-600">
          We collect buy-ins and handle payouts for you — $1 per entry. Coming for the 2027 season.
        </p>
        {interestJoined ? (
          <p className="mt-2 text-sm font-medium text-green-700">You&apos;re on the waitlist.</p>
        ) : (
          <button
            type="button"
            onClick={() => void joinWaitlist()}
            disabled={interestBusy}
            className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Join the waitlist
          </button>
        )}
      </section>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save settings"}
      </button>
      {saved && <p className="text-sm text-green-700">Saved.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 5: Settings link.** On the league page, next to the commissioner's invite button, add `<Link href={`/leagues/${league.id}/settings`} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50">Settings</Link>` (commissioner only).

- [ ] **Step 6: Gates + commit.** `npm test` (130), tsc, lint, build. Manual: free-league commissioner sees grid disabled + upsell copy; preset switch saves; fee+venmo save and persist. NOTE: the fake-door "Join the waitlist" button calls `/api/leagues/[id]/dues-interest`, which lands in Task 8 — clicking it 404s until then; that's expected at this task boundary.

```bash
git add -A && git commit -m "feat: league settings — scoring editor (premium), dues config"
```

---

### Task 7: Ad slot on free leagues

**Files:**
- Create: `src/components/ad-slot.tsx`
- Modify: `src/app/leagues/[leagueId]/page.tsx`, `.env.example`

- [ ] **Step 1: Component** — create `src/components/ad-slot.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Script from "next/script";

// The spec's single tasteful ad slot, free leagues only. Ad network choice is an
// open spec item; this mounts AdSense when configured and disappears otherwise.
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot() {
  useEffect(() => {
    if (CLIENT && SLOT) {
      try {
        (window.adsbygoogle = window.adsbygoogle ?? []).push({});
      } catch {
        /* blocked or double-push — never break the page over an ad */
      }
    }
  }, []);

  if (!CLIENT || !SLOT) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-gray-400">
        Ad slot (set NEXT_PUBLIC_ADSENSE_CLIENT + NEXT_PUBLIC_ADSENSE_SLOT)
      </div>
    );
  }
  return (
    <>
      <Script
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <ins
        className="adsbygoogle block"
        data-ad-client={CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );
}
```

- [ ] **Step 2: Mount.** League page: render `<div className="mt-8"><AdSlot /></div>` at the bottom of `<main>` ONLY when `league.tier === "FREE"`.

- [ ] **Step 3: Env docs.** `.env.example`:

```
# Free-tier ad slot (AdSense). Empty = no ads (dev shows a placeholder box).
NEXT_PUBLIC_ADSENSE_CLIENT=""
NEXT_PUBLIC_ADSENSE_SLOT=""
```

- [ ] **Step 4: Gates + commit.** Manual: free league shows the dev placeholder; premium league (psql-flipped) doesn't.

```bash
git add -A && git commit -m "feat: free-tier ad slot"
```

---

### Task 8: Dues tracking + fake-door APIs and league-page panel

**Files:**
- Create: `src/domain/leagues/dues.ts`, `src/app/api/leagues/[leagueId]/entries/[entryId]/dues/route.ts`, `src/app/api/leagues/[leagueId]/dues-interest/route.ts`, `src/components/dues-panel.tsx`
- Test: `src/domain/leagues/dues.test.ts`
- Modify: `src/app/leagues/[leagueId]/page.tsx`

- [ ] **Step 1: Failing test** — create `src/domain/leagues/dues.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { joinLeague } from "./join-league";
import { setDuesPaid, recordDuesInterest } from "./dues";
import { NotCommissionerError } from "../errors";

async function setup() {
  const commish = await createTestUser("Commish");
  const friend = await createTestUser("Friend");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "CT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const entry = await joinLeague(testDb, {
    userId: friend.id, inviteCode: league.inviteCode, teamName: "FT",
  });
  return { commish, friend, league, entry };
}

describe("dues", () => {
  beforeEach(resetDb);

  it("commissioner toggles an entry's paid flag", async () => {
    const { commish, league, entry } = await setup();
    const updated = await setDuesPaid(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entry.id, paid: true,
    });
    expect(updated.duesPaid).toBe(true);
    const back = await setDuesPaid(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entry.id, paid: false,
    });
    expect(back.duesPaid).toBe(false);
  });

  it("rejects non-commissioners and cross-league entries", async () => {
    const { friend, league, entry } = await setup();
    await expect(
      setDuesPaid(testDb, { leagueId: league.id, userId: friend.id, entryId: entry.id, paid: true }),
    ).rejects.toThrow(NotCommissionerError);

    const other = await createTestUser("Other");
    const otherLeague = await createLeague(testDb, {
      userId: other.id, name: "L2", teamName: "OT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await expect(
      setDuesPaid(testDb, {
        leagueId: otherLeague.id, userId: other.id, entryId: entry.id, paid: true,
      }),
    ).rejects.toThrow(/entry not in league/i);
  });

  it("records dues-collection interest once per commissioner", async () => {
    const { commish, league } = await setup();
    await recordDuesInterest(testDb, { leagueId: league.id, userId: commish.id });
    await recordDuesInterest(testDb, { leagueId: league.id, userId: commish.id }); // idempotent
    expect(await testDb.duesCollectionInterest.count()).toBe(1);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/leagues/dues.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { NotCommissionerError } from "../errors";

async function requireCommissioner(db: PrismaClient, leagueId: string, userId: string) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();
}

export async function setDuesPaid(
  db: PrismaClient,
  input: { leagueId: string; userId: string; entryId: string; paid: boolean },
) {
  await requireCommissioner(db, input.leagueId, input.userId);
  const entry = await db.entry.findUnique({ where: { id: input.entryId } });
  if (!entry || entry.leagueId !== input.leagueId) throw new Error("entry not in league");
  return db.entry.update({ where: { id: input.entryId }, data: { duesPaid: input.paid } });
}

/** Fake-door signal: which commissioners want us to collect dues. Idempotent. */
export async function recordDuesInterest(
  db: PrismaClient,
  input: { leagueId: string; userId: string },
) {
  await requireCommissioner(db, input.leagueId, input.userId);
  return db.duesCollectionInterest.upsert({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
    create: { leagueId: input.leagueId, userId: input.userId },
    update: {},
  });
}
```

- [ ] **Step 3: Routes.**

`src/app/api/leagues/[leagueId]/entries/[entryId]/dues/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { setDuesPaid } from "@/domain/leagues/dues";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string; entryId: string }> };

const bodySchema = z.object({ paid: z.boolean() });

export async function PATCH(req: Request, { params }: Params) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const entry = await setDuesPaid(db, {
      leagueId, userId: user.id, entryId, paid: parsed.data.paid,
    });
    return NextResponse.json({ ok: true, duesPaid: entry.duesPaid });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    if (err instanceof Error && /entry not in league/i.test(err.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
```

`src/app/api/leagues/[leagueId]/dues-interest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { recordDuesInterest } from "@/domain/leagues/dues";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    await recordDuesInterest(db, { leagueId, userId: user.id });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Dues panel.** Create `src/components/dues-panel.tsx`:

```tsx
"use client";

import { useState } from "react";

interface DuesEntry {
  entryId: string;
  name: string;
  ownerName: string;
  duesPaid: boolean;
  isMine: boolean;
}

interface Props {
  leagueId: string;
  isCommissioner: boolean;
  entryFeeCents: number;
  venmoHandle: string | null;
  entries: DuesEntry[];
}

export function DuesPanel({ leagueId, isCommissioner, entryFeeCents, venmoHandle, entries }: Props) {
  const [rows, setRows] = useState(entries);
  const [error, setError] = useState<string | null>(null);
  const fee = `$${(entryFeeCents / 100).toFixed(entryFeeCents % 100 === 0 ? 0 : 2)}`;

  async function toggle(entryId: string, paid: boolean) {
    setError(null);
    const prev = rows;
    setRows((r) => r.map((e) => (e.entryId === entryId ? { ...e, duesPaid: paid } : e)));
    try {
      const res = await fetch(`/api/leagues/${leagueId}/entries/${entryId}/dues`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paid }),
      });
      if (!res.ok) {
        setRows(prev);
        setError("Couldn't update — try again.");
      }
    } catch {
      setRows(prev);
      setError("Couldn't reach the server.");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 font-semibold">Dues</h2>
      <p className="mb-3 text-sm text-gray-500">
        {fee} per team{venmoHandle && (
          <>
            {" "}·{" "}
            <a
              href={`https://venmo.com/u/${venmoHandle}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              pay @{venmoHandle} on Venmo
            </a>
          </>
        )}{" "}
        · handled outside the app
      </p>
      <ul className="rounded-lg border text-sm">
        {rows.map((e) => (
          <li key={e.entryId} className="flex items-center justify-between border-b p-2 last:border-b-0">
            <span className={e.isMine ? "font-medium" : ""}>
              {e.name} <span className="text-gray-500">{e.ownerName}</span>
            </span>
            {isCommissioner ? (
              <button
                type="button"
                onClick={() => void toggle(e.entryId, !e.duesPaid)}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  e.duesPaid ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                }`}
              >
                {e.duesPaid ? "Paid ✓" : "Mark paid"}
              </button>
            ) : (
              <span
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  e.duesPaid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {e.duesPaid ? "Paid" : "Unpaid"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 5: Mount on the league page.** When `settings.entryFeeCents` is non-null, render `<DuesPanel>` (below Teams, above the ad slot) with entries mapped to the DuesEntry shape (`isMine` = entry's membership userId === current user). The league page query already includes entries+membership+user; add `duesPaid: true` to whatever select shape it uses (or confirm full entry objects flow through).

- [ ] **Step 6: Gates + commit.** `npm test` (133).

```bash
git add -A && git commit -m "feat: dues tracking panel and dues-collection fake door"
```

---

### Task 9: E2E — settings, dues, fake door

**Files:**
- Create: `e2e/monetization.spec.ts`

- [ ] **Step 1: Spec** — create `e2e/monetization.spec.ts` (reuse the signUp helper pattern from the other specs — read one first):

```ts
import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues/new");
  await page.getByPlaceholder("The Gerner Invitational").fill(name);
  await page.getByPlaceholder("Team Nick").fill("Commish Team");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("settings: dues config, premium upsell, fake-door waitlist", async ({ page }) => {
  const stamp = Date.now();
  await signUp(page, "Commish", `mon-commish-${stamp}@example.com`);
  await createLeague(page, "Monetization League");

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "League settings" })).toBeVisible();

  // free tier: custom grid disabled + upsell copy + upgrade button present
  await expect(page.getByText("Editing individual values is a Premium feature")).toBeVisible();
  await expect(page.getByRole("button", { name: /Upgrade to Premium/ })).toBeVisible();

  // dues config saves
  await page.getByLabel("Entry fee ($)").fill("50");
  await page.getByLabel("Venmo handle").fill("test-commish");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // fake door
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByText("You're on the waitlist.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You're on the waitlist.")).toBeVisible(); // persisted

  // league page shows the dues panel with the venmo link
  await page.goto(page.url().replace("/settings", ""));
  await expect(page.getByText("$50 per team")).toBeVisible();
  await expect(page.getByRole("link", { name: "pay @test-commish on Venmo" })).toBeVisible();

  // commissioner marks own entry paid
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByRole("button", { name: "Paid ✓" })).toBeVisible();
});
```

Adjust selectors to the real rendered DOM (labels use nested `<label>` text — `getByLabel` should resolve; if not, fall back to placeholder selectors and note it).

- [ ] **Step 2: Run.** `npm run test:e2e` → 5 passed (4 existing + 1 new).

- [ ] **Step 3: Commit.**

```bash
git add -A && git commit -m "test: monetization e2e — settings, dues, fake door"
```

---

### Task 10: Docs + final sweep

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README.** Add to the env notes: Stripe test keys + `stripe listen --forward-to localhost:3000/api/webhooks/stripe` for local webhook testing; AdSense env vars. One line in the product blurb about free vs premium leagues ($25/season: custom scoring, 25 teams, more leagues, no ads).

- [ ] **Step 2: Final sweep.**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

All green (report counts).

- [ ] **Step 3: Commit.**

```bash
git add -A && git commit -m "docs: monetization setup notes"
```

---

## Deferred (explicit)

- **Phase 4B (next plan):** weekly recap + pre-weekend preview notifications, elimination/alive tracking, premium analytics (projections/odds/props — port sources now live in git history pre-`legacy` deletion), substitutions scoring, multiple-entries-per-person join flow
- **Phase 5:** production deploy (Vercel + Neon + real Stripe/AdSense config via Terraform per gv-infra conventions), PostHog (incl. fake-door conversion events), sync alerting, December beta
- Stripe refunds/disputes ops (dashboard-manual for now; `PurchaseStatus.REFUNDED` exists for bookkeeping)
