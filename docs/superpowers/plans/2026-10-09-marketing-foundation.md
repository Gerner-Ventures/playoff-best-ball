# Marketing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public marketing site in cobalt, a confirmed-opt-in email list that we own (account holders are on it by default), search and sharing basics, and public invite-link previews.

**Architecture:**
- **List.** The list is one `EmailSubscriber` table. Domain functions in `src/domain/subscribers/` take an injected Prisma client and a `MarketingSender`, so they can be tested against the real test database with a fake sender. Route handlers stay thin.
- **Pages.** Marketing pages live in a `(marketing)` route group and prerender. The root layout stops reading the session, which today forces every page to render per request. A Next 16 `proxy.ts` redirects signed-in visitors away from `/`.
- **Three stacked PRs:**
  - A: list backend.
  - B: pages. Needs #42 merged.
  - C: search, share images, invite previews.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`, metadata file conventions), better-auth 1.7.5, Prisma 7 + Postgres 17, zod 4, Resend 6, Tailwind v4 with #42's cobalt tokens, Vitest (node env, real Postgres), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-marketing-foundation-design.md`. Read it before starting any task.

### Spec clarifications made while planning (deliberate, keep them)

1. **The confirm-token hash is kept after confirmation** (spec §5.3 said "cleared").
   - Clicking the email link again, or double-clicking Confirm, lands on "You're on the list" instead of an error.
   - Only a `PENDING` row can be confirmed. A kept hash on an `ACTIVE` row is a no-op, and on an `UNSUBSCRIBED` row it is rejected, so an old link can never undo an unsubscribe.
   - A new signup replaces the hash.
2. **`/join/` is not disallowed in `robots.txt`** (spec §6 listed it). Invite pages use a `noindex` meta tag instead, for two reasons:
   - Twitterbot obeys robots.txt, and a disallow would kill the invite share card.
   - Google can only honor `noindex` on pages it is allowed to crawl.
3. **Copy must not claim lineup optimization.**
   - Every league drafts exactly as many players as roster slots (9). There is no bench, so every drafted player scores every round his team is alive.
   - "No lineups to set" is true. "Your best lineup sets itself" is not.

## Global Constraints

- **Next.js 16:** middleware is `src/proxy.ts`, exporting `proxy` and `config`. Route segment `export const revalidate` is available because `cacheComponents` is off. Read the relevant guide in `node_modules/next/dist/docs/` before using any Next API not shown in this plan (AGENTS.md).
- **No new npm dependencies.** The lockfile must be generated with npm 11. Everything here uses packages already installed (`next/og`, `node:crypto`, `resend`, `zod`, `better-auth`).
- **Schema changes need a migration.** CI fails if `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` reports drift.
- **Emails are normalized** with `normalizeEmail` (trim + lowercase) before every read or write of `EmailSubscriber.email`.
- **Mail sending:**
  - List mail goes only through `getMarketingSender()`, from `MARKETING_FROM_EMAIL` on `news.playoffbestball.com`.
  - Every list email carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
  - The magic-link sender in `src/lib/auth.ts` is not changed.
- **`POST /api/subscribe` responses** are always `200 {"ok":true}` regardless of list membership. The only exceptions are 400 (bad input) and 502 (send failed).
- **Marketing pages stay static.** Nothing under `src/app/(marketing)/` may call `getSessionUser`, `cookies()` or `headers()`. The one exception is the email-flow pages, which read `searchParams`.
- **Copy:**
  - Dates come only from `SEASON_CALENDAR`.
  - Prices and caps come only from `PREMIUM_PRICE_CENTS`, `FREE_TIER_MAX_ENTRIES` and `PREMIUM_MAX_ENTRIES`.
  - Make no claims the code doesn't enforce: no dues reminders, no lineup optimization.
  - Product name: "Playoff Best Ball".
- **Cobalt:**
  - Use #42's tokens and primitives (`.btn`, `.btn-primary`, `.input`, `.card`, and `text-ink`/`bg-surface`-style utilities).
  - Marketing surfaces sit inside `.theme-light`.
  - Touch targets are at least 44px, so use `.btn`, never `.btn-sm`, on marketing pages.
- **Commits:** a conventional prefix (`feat:`, `fix:`, `test:`, `docs:`, `ci:`), a body explaining why, and this final line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

These are the inputs the spec implies but its happy-path tests would miss. Each has a test added in the owning task.

1. **Case and whitespace in email addresses.** `" Fan@Example.COM "` from the form, the same address on an account, and an already-backfilled row must all resolve to one row. Tests in Tasks A1, A4, A6.
2. **Truncated, mangled or missing tokens** (email clients wrap long URLs; people paste half a link). Expect a friendly "not recognized" page or 404, never a 500 or a DB error. Tests in Tasks A5, A7.
3. **Double submits.** Double-clicking Confirm or Unsubscribe, or two first signups racing for one address, must be idempotent with no 500. Tests in Tasks A4, A5.
4. **Garbage request bodies.** Non-JSON, an overlong email, an unknown `source`, or a filled honeypot get a 400 or the generic 200, never a 500. Test in Task A7.
5. **A signed-in visitor using the marketing header's "Sign in"** lands on the dashboard, not the sign-in form, and `/` itself redirects. Tests in Tasks B2, B8.

---

## Execution Environment

- **Worktree:** `/home/ng/Code/playoff-best-ball-marketing`.
- **Branches, stacked:**
  - Phase A on `feat/marketing-foundation`, which already holds the spec commit.
  - Phase B on `feat/marketing-pages`, branched from A's tip.
  - Phase C on `feat/marketing-seo-invite`, branched from B's tip.
  - Each phase ends with a PR based on the previous branch (`main` for A). Merge them in order.
- **Postgres:** Docker is usually unavailable from the agent shell. Use the embedded-postgres recipe in memory `local-test-db-without-docker`:
  - Launcher: `/tmp/claude-1000/-home-ng-Code-playoff-best-ball/4901567d-11aa-438a-a938-506bdf6d433d/scratchpad/pg/start.mjs`, on port 5433 with user/pass `pbb`; it creates `pbb_test` and `pbb_shadow`.
  - Run it in the background with the sandbox disabled. Delete `scratchpad/pg/data` first if it exists. Stop it by PID.
  - If the scratchpad is gone, recreate it with `npm i embedded-postgres@17.10.0-beta.17` and the launcher from that memory.
- **Shared env for all commands below:**

  ```bash
  export DATABASE_URL=postgresql://pbb:pbb@localhost:5433/pbb_test
  export SHADOW_DATABASE_URL=postgresql://pbb:pbb@localhost:5433/pbb_shadow
  ```

- **Full CI mirror** (run at every phase end):

  ```bash
  npx prisma migrate deploy
  npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
  npm run lint && npm run typecheck && npm test
  BETTER_AUTH_SECRET=ci-secret-0123456789abcdef0123456789abcdef npm run build
  npm run test:e2e
  ```

- **Single test file:** `npx dotenv -e .env.test -- npx vitest run <path>`.

## File Map

**Phase A — list backend**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `SubscriberStatus` enum, `EmailSubscriber` model, `User.emailSubscriber` |
| `prisma/migrations/20261009120000_email_subscriber/migration.sql` | Table and indexes, plus the account-holder backfill between `-- backfill:begin` / `-- backfill:end` |
| `src/domain/subscribers/tokens.ts` | `newToken`, `hashToken`, `isWellFormedToken`, `normalizeEmail` |
| `src/domain/subscribers/sources.ts` | `SUBSCRIBE_SOURCES`, `SubscribeSource`, `ACCOUNT_SOURCE` (no imports, so client-safe) |
| `src/domain/subscribers/sender.ts` | `MarketingEmail`, `MarketingSender`, `SubscriberUrls` interfaces |
| `src/domain/subscribers/confirmation-email.ts` | `buildConfirmationEmail` (pure) |
| `src/domain/subscribers/subscribe.ts` | `requestSubscription`, `ConfirmationEmailFailedError`, `RESEND_THROTTLE_MS` |
| `src/domain/subscribers/confirm.ts` | `confirmSubscription`, `CONFIRM_TTL_MS` |
| `src/domain/subscribers/unsubscribe.ts` | `unsubscribeByToken`, `resubscribeByToken` |
| `src/domain/subscribers/account.ts` | `ensureAccountSubscriber`, `getDigestPreference`, `setDigestPreference` |
| `src/lib/site-url.ts` | `CANONICAL_ORIGIN`, `appOrigin`, `subscriberUrls` |
| `src/lib/email/marketing.ts` | `createMarketingSender`, `getMarketingSender` (Resend + headers + dev fallback) |
| `src/lib/analytics-events.ts` | new event names |
| `src/lib/analytics-client.ts` | `captureClientEvent` |
| `src/lib/auth.ts` | `databaseHooks.user.create.after`, which calls `ensureAccountSubscriber` |
| `src/app/api/subscribe/route.ts` | form signup |
| `src/app/api/subscribe/confirm/route.ts` | confirm button POST → 303 |
| `src/app/api/unsubscribe/route.ts` | page button POST → 303, and RFC 8058 one-click |
| `src/app/api/unsubscribe/undo/route.ts` | resubscribe POST → 303 |
| `src/app/api/me/digest/route.ts` | settings toggle GET/PATCH |
| `src/components/digest-toggle.tsx` | settings checkbox |
| `src/app/settings/notifications/page.tsx` | renders the toggle |
| `tests/helpers/db.ts` | `resetDb` clears `emailSubscriber` (pre-#42 form) |

**Phase B — pages**

| File | Responsibility |
|---|---|
| `src/app/globals.css`, `scripts/check-contrast.mjs`, `package.json`, `.github/workflows/ci.yml` | `--bad` token, `.theme-light`, light focus ring, contrast pairs, CI steps |
| `src/app/layout.tsx`, `src/components/analytics-provider.tsx` | no server session read; client-side identify; `metadataBase` |
| `src/proxy.ts` | `/` → `/dashboard` when a session cookie is present |
| `src/lib/launch.ts`, `src/lib/season-calendar.ts` | launch phase; key dates |
| `src/components/marketing/*` | wordmark, header, footer, signup form, CTA link, key dates, steps, FAQ list |
| `src/components/marketing/faq-content.ts` | FAQ items (shared by `/faq`, `/pricing`, home) |
| `src/domain/scoring-reference.ts` | scoring and roster tables derived from engine constants |
| `src/app/(marketing)/layout.tsx` and `page.tsx`, `how-it-works/`, `scoring/`, `commissioners/`, `pricing/`, `faq/`, `subscribe/confirm/`, `subscribe/confirmed/`, `unsubscribe/` | pages |
| `scripts/check-static-routes.mjs` | prerender guard |

Deleted in Phase B: `src/app/page.tsx` (moved), `src/app/pricing/page.tsx` (moved), and `src/components/chalk-play-diagram.tsx` if nothing else imports it.

**Phase C — search, share, invite**

| File | Responsibility |
|---|---|
| `src/lib/indexing.ts` | `isIndexable`, `robotsRules`, `sitemapEntries`, `PUBLIC_ROUTES` |
| `src/app/robots.ts`, `src/app/sitemap.ts` | metadata routes |
| `src/lib/og.tsx` | `OG_SIZE`, `renderOgImage` |
| `src/app/(marketing)/**/opengraph-image.tsx` | per-page share images |
| `src/domain/leagues/invite-preview.ts` | `getInvitePreview`, `firstName`, `formatDraftTime` |
| `src/components/invite/public-invite.tsx`, `src/components/invite/track-invite-view.tsx` | signed-out invite UI |
| `src/app/join/[code]/page.tsx`, `src/app/join/[code]/opengraph-image.tsx` | public branch, `generateMetadata`, share card |

---

# Phase A — List backend (branch `feat/marketing-foundation`)

### Task A1: `EmailSubscriber` schema, migration and account backfill

**Files:**
- Modify: `prisma/schema.prisma` (add the enum and model after `model Account`; add a relation field on `model User`)
- Create: `prisma/migrations/20261009120000_email_subscriber/migration.sql`
- Modify: `tests/helpers/db.ts` (`resetDb`)
- Test: `tests/email-subscriber-backfill.test.ts`

**Interfaces:**
- Produces: the Prisma model `EmailSubscriber`, with fields `id`, `email`, `userId`, `source`, `status`, `confirmTokenHash`, `confirmSentAt`, `confirmedAt`, `unsubscribeToken`, `unsubscribedAt`, `createdAt`, `updatedAt`. Produces the enum `SubscriberStatus` = `PENDING | ACTIVE | UNSUBSCRIBED`, and `testDb.emailSubscriber`.

- [ ] **Step 1: Write the failing backfill test**

```ts
// tests/email-subscriber-backfill.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { testDb, resetDb, createTestUser } from "./helpers/db";

/**
 * The backfill runs once, at deploy, against production users. It is tested by
 * re-running the exact SQL from the migration file, so the test and the migration
 * cannot drift apart.
 */
function backfillSql(): string {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261009120000_email_subscriber/migration.sql"),
    "utf8",
  );
  const match = sql.match(/-- backfill:begin\n([\s\S]*?)-- backfill:end/);
  if (!match) throw new Error("backfill markers not found in migration.sql");
  return match[1];
}

describe("EmailSubscriber account backfill", () => {
  beforeEach(resetDb);

  it("gives every existing user one ACTIVE account row with a unique 64-hex token", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");

    await testDb.$executeRawUnsafe(backfillSql());

    const rows = await testDb.emailSubscriber.findMany();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("ACTIVE");
      expect(row.source).toBe("account");
      expect(row.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
      expect(row.confirmedAt).not.toBeNull();
    }
    expect(new Set(rows.map((r) => r.unsubscribeToken)).size).toBe(2);
    expect(rows.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
  });

  it("stores the address trimmed and lowercased", async () => {
    const user = await testDb.user.create({
      data: { id: randomUUID(), name: "Caps", email: "  Caps@Example.COM " },
    });

    await testDb.$executeRawUnsafe(backfillSql());

    const row = await testDb.emailSubscriber.findUnique({ where: { email: "caps@example.com" } });
    expect(row?.userId).toBe(user.id);
  });

  it("leaves an address that is already on the list alone", async () => {
    const user = await createTestUser("Already");
    await testDb.emailSubscriber.create({
      data: {
        email: user.email.toLowerCase(),
        source: "footer",
        status: "UNSUBSCRIBED",
        unsubscribeToken: "u".repeat(43),
      },
    });

    await testDb.$executeRawUnsafe(backfillSql());

    const row = await testDb.emailSubscriber.findUnique({ where: { email: user.email.toLowerCase() } });
    expect(row?.status).toBe("UNSUBSCRIBED");
    expect(row?.userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run tests/email-subscriber-backfill.test.ts`
Expected: FAIL. `testDb.emailSubscriber` is undefined (TypeScript or runtime error) and/or `ENOENT` for `migration.sql`.

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, inside `model User`, add after `mockDraft     MockDraft?`:

```prisma
  emailSubscriber   EmailSubscriber?
```

After the closing `}` of `model Account`, add:

```prisma
enum SubscriberStatus {
  PENDING
  ACTIVE
  UNSUBSCRIBED
}

/// One row per address on the marketing list, whether it came from the signup form or from an account.
/// See docs/superpowers/specs/2026-10-09-marketing-foundation-design.md §5.
model EmailSubscriber {
  id               String           @id @default(cuid())
  email            String           @unique // normalizeEmail(): trimmed + lowercased
  userId           String?          @unique
  user             User?            @relation(fields: [userId], references: [id], onDelete: SetNull)
  source           String // a SUBSCRIBE_SOURCES value, or "account"
  status           SubscriberStatus
  confirmTokenHash String?          @unique // sha256 hex of the emailed token; kept after confirm so re-clicks are idempotent
  confirmSentAt    DateTime?
  confirmedAt      DateTime?
  unsubscribeToken String           @unique // in every email; proves control of the address
  unsubscribedAt   DateTime?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}
```

- [ ] **Step 4: Write the migration**

Create `prisma/migrations/20261009120000_email_subscriber/migration.sql`:

```sql
-- Marketing list (spec 2026-10-09 §5). One row per address; account holders and
-- signup-form subscribers share it so every unsubscribe path flips one status.

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "EmailSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "status" "SubscriberStatus" NOT NULL,
    "confirmTokenHash" TEXT,
    "confirmSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_email_key" ON "EmailSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_userId_key" ON "EmailSubscriber"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_confirmTokenHash_key" ON "EmailSubscriber"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_unsubscribeToken_key" ON "EmailSubscriber"("unsubscribeToken");

-- AddForeignKey
ALTER TABLE "EmailSubscriber" ADD CONSTRAINT "EmailSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Account holders are on the weekly digest by default (spec §5.5); this gives every
-- existing user their row. Raw SQL has to supply "id" because Prisma's cuid() default
-- is client-side. gen_random_uuid() is built into Postgres 13+; gen_random_bytes()
-- would need pgcrypto, which this database does not enable. The token is two UUIDs
-- with the dashes stripped: 64 hex characters, ~244 random bits. ON CONFLICT covers
-- two accounts whose addresses differ only by case; the second is linked lazily by
-- ensureAccountSubscriber, which leaves an address held by another account alone.
-- tests/email-subscriber-backfill.test.ts executes exactly the text between the markers.
-- backfill:begin
INSERT INTO "EmailSubscriber" ("id", "email", "userId", "source", "status", "confirmedAt", "unsubscribeToken", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  lower(btrim(u."email")),
  u."id",
  'account',
  'ACTIVE'::"SubscriberStatus",
  CURRENT_TIMESTAMP,
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user" u
ON CONFLICT ("email") DO NOTHING;
-- backfill:end
```

- [ ] **Step 5: Clear the new table in `resetDb`**

In `tests/helpers/db.ts`, make the first line of `resetDb()`'s body:

```ts
  await testDb.emailSubscriber.deleteMany();
```

(When #42 merges in Task B1, its TRUNCATE-all-tables `resetDb` replaces this function. Take #42's version; it covers the new table automatically.)

- [ ] **Step 6: Apply the migration, regenerate the client, check drift**

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
```
Expected: "All migrations have been successfully applied." and then "No difference detected." If the diff reports a difference, make the SQL match what it prints. Do not edit the schema to match the SQL.

- [ ] **Step 7: Run the test and confirm it passes**

Run: `npx dotenv -e .env.test -- npx vitest run tests/email-subscriber-backfill.test.ts`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261009120000_email_subscriber tests/helpers/db.ts tests/email-subscriber-backfill.test.ts
git commit -m "feat: EmailSubscriber table with account-holder backfill

One row per address on the marketing list, whether it came from the signup form or
an account, so every unsubscribe path flips the same status. Existing users get an
ACTIVE row: account holders are on the weekly digest by default (spec §5.5).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A2: Token and email helpers

**Files:**
- Create: `src/domain/subscribers/tokens.ts`, `src/domain/subscribers/sources.ts`
- Test: `src/domain/subscribers/tokens.test.ts`

**Interfaces:**
- Produces:
  - `newToken(): string` — 43-character base64url
  - `hashToken(token: string): string` — 64-character hex
  - `isWellFormedToken(token: unknown): token is string`
  - `normalizeEmail(email: string): string`
  - `SUBSCRIBE_SOURCES`, `type SubscribeSource`, `ACCOUNT_SOURCE = "account"`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/subscribers/tokens.test.ts
import { describe, it, expect } from "vitest";
import { hashToken, isWellFormedToken, newToken, normalizeEmail } from "./tokens";

describe("tokens", () => {
  it("newToken is 43 URL-safe characters and unique", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashToken is a stable 64-hex sha256", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("isWellFormedToken accepts app tokens and backfilled hex tokens", () => {
    expect(isWellFormedToken(newToken())).toBe(true);
    expect(isWellFormedToken("a1".repeat(32))).toBe(true);
  });

  it("isWellFormedToken rejects truncated, mangled and non-string input", () => {
    for (const bad of ["", "abc", newToken().slice(0, 20), "x".repeat(200), "has space in it 0123456789abcdef0123", "%2Fencoded%2Fjunk0123456789abcdef", undefined, null, 42, {}]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });

  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Fan@Example.COM ")).toBe("fan@example.com");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/tokens.test.ts`
Expected: FAIL. Cannot find module `./tokens`.

- [ ] **Step 3: Implement**

```ts
// src/domain/subscribers/tokens.ts
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as base64url: 43 URL-safe characters. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex. Confirm tokens are stored only as this hash; the raw token lives in the email. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Cheap shape check before any database lookup. It accepts newToken() output and the
 * migration's 64-hex backfill tokens, and turns away truncated or mangled links
 * (email clients wrap long URLs) without a query.
 */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

/** Trim + lowercase. Every read and write of EmailSubscriber.email goes through this. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

```ts
// src/domain/subscribers/sources.ts
/**
 * Where a form signup came from. Imports nothing, so client components can use it.
 * "account" is reserved for account holders (spec §5.5) and the form never accepts it.
 */
export const SUBSCRIBE_SOURCES = [
  "home_hero",
  "footer",
  "how_it_works",
  "scoring",
  "commissioners",
  "faq",
  "pricing",
  "subscribe_page",
] as const;

export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

export const ACCOUNT_SOURCE = "account";
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/tokens.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/subscribers/tokens.ts src/domain/subscribers/sources.ts src/domain/subscribers/tokens.test.ts
git commit -m "feat: subscriber token and email helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: Marketing sender, confirmation email, site URLs

**Files:**
- Create: `src/domain/subscribers/sender.ts`, `src/domain/subscribers/confirmation-email.ts`, `src/lib/site-url.ts`, `src/lib/email/marketing.ts`
- Modify: `.env.example` (add `MARKETING_FROM_EMAIL=` after `NOTIFY_FROM_EMAIL=`)
- Test: `src/domain/subscribers/confirmation-email.test.ts`, `src/lib/email/marketing.test.ts`, `src/lib/site-url.test.ts`

**Interfaces:**
- Produces:
  - `interface MarketingEmail { to: string; subject: string; text: string; html: string; oneClickUnsubscribeUrl: string }`
  - `interface MarketingSender { send(email: MarketingEmail): Promise<void> }`
  - `interface SubscriberUrls { confirm(token: string): string; unsubscribePage(token: string): string; oneClickUnsubscribe(token: string): string }`
  - `buildConfirmationEmail(input: { to: string; confirmUrl: string; unsubscribePageUrl: string; oneClickUnsubscribeUrl: string }): MarketingEmail`
  - `CANONICAL_ORIGIN = "https://playoffbestball.com"`
  - `appOrigin(env?: { BETTER_AUTH_URL?: string }): string`
  - `subscriberUrls(origin?: string): SubscriberUrls`
  - `createMarketingSender(opts: { resend: ResendLike | null; from: string | undefined; mustSend: boolean; log?: (line: string) => void }): MarketingSender`
  - `getMarketingSender(): MarketingSender`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/subscribers/confirmation-email.test.ts
import { describe, it, expect } from "vitest";
import { buildConfirmationEmail } from "./confirmation-email";

const input = {
  to: "fan@example.com",
  confirmUrl: "https://x.test/subscribe/confirm?token=abc&x=1",
  unsubscribePageUrl: "https://x.test/unsubscribe?token=def",
  oneClickUnsubscribeUrl: "https://x.test/api/unsubscribe?token=def",
};

describe("buildConfirmationEmail", () => {
  it("addresses the email and carries both links in text and html", () => {
    const email = buildConfirmationEmail(input);
    expect(email.to).toBe("fan@example.com");
    expect(email.subject).toMatch(/confirm/i);
    expect(email.text).toContain(input.confirmUrl);
    expect(email.text).toContain(input.unsubscribePageUrl);
    expect(email.html).toContain("https://x.test/subscribe/confirm?token=abc&amp;x=1");
    expect(email.oneClickUnsubscribeUrl).toBe(input.oneClickUnsubscribeUrl);
  });

  it("says how long the link lasts and that ignoring it is safe", () => {
    const { text } = buildConfirmationEmail(input);
    expect(text).toMatch(/7 days/);
    expect(text).toMatch(/ignore this email/i);
  });
});
```

```ts
// src/lib/site-url.test.ts
import { describe, it, expect } from "vitest";
import { appOrigin, subscriberUrls } from "./site-url";

describe("site urls", () => {
  it("uses BETTER_AUTH_URL without a trailing slash, defaulting to localhost", () => {
    expect(appOrigin({ BETTER_AUTH_URL: "https://playoffbestball.com/" })).toBe("https://playoffbestball.com");
    expect(appOrigin({})).toBe("http://localhost:3000");
  });

  it("builds the three subscriber links with an encoded token", () => {
    const urls = subscriberUrls("https://p.test");
    expect(urls.confirm("a-b_c")).toBe("https://p.test/subscribe/confirm?token=a-b_c");
    expect(urls.unsubscribePage("t")).toBe("https://p.test/unsubscribe?token=t");
    expect(urls.oneClickUnsubscribe("t")).toBe("https://p.test/api/unsubscribe?token=t");
  });
});
```

```ts
// src/lib/email/marketing.test.ts
import { describe, it, expect } from "vitest";
import { createMarketingSender, type ResendLike } from "./marketing";
import type { MarketingEmail } from "@/domain/subscribers/sender";

const email: MarketingEmail = {
  to: "fan@example.com",
  subject: "Confirm",
  text: "body https://x.test/subscribe/confirm?token=abc",
  html: "<p>body</p>",
  oneClickUnsubscribeUrl: "https://x.test/api/unsubscribe?token=def",
};

function fakeResend(error: { name: string; message: string } | null = null) {
  const calls: Parameters<ResendLike["emails"]["send"]>[0][] = [];
  const resend: ResendLike = {
    emails: {
      async send(payload) {
        calls.push(payload);
        return { error };
      },
    },
  };
  return { resend, calls };
}

describe("createMarketingSender", () => {
  it("sends through Resend with RFC 8058 one-click unsubscribe headers", async () => {
    const { resend, calls } = fakeResend();
    await createMarketingSender({ resend, from: "PBB <hello@news.test>", mustSend: true }).send(email);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ from: "PBB <hello@news.test>", to: "fan@example.com", subject: "Confirm" });
    expect(calls[0].headers).toEqual({
      "List-Unsubscribe": "<https://x.test/api/unsubscribe?token=def>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("throws when Resend reports an error", async () => {
    const { resend } = fakeResend({ name: "validation_error", message: "bad from" });
    await expect(createMarketingSender({ resend, from: "x@news.test", mustSend: true }).send(email)).rejects.toThrow(/bad from/);
  });

  it("refuses to silently drop mail where it must send", async () => {
    await expect(createMarketingSender({ resend: null, from: undefined, mustSend: true }).send(email)).rejects.toThrow(/MARKETING_FROM_EMAIL/);
  });

  it("logs the email instead of sending in development", async () => {
    const lines: string[] = [];
    await createMarketingSender({ resend: null, from: undefined, mustSend: false, log: (l) => lines.push(l) }).send(email);
    expect(lines.join("\n")).toContain("https://x.test/subscribe/confirm?token=abc");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/confirmation-email.test.ts src/lib/site-url.test.ts src/lib/email/marketing.test.ts`
Expected: FAIL. Modules are not found.

- [ ] **Step 3: Implement**

```ts
// src/domain/subscribers/sender.ts
/** One list email. The sender turns oneClickUnsubscribeUrl into the List-Unsubscribe headers. */
export interface MarketingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** RFC 8058 one-click endpoint (POST), not the human-facing unsubscribe page. */
  oneClickUnsubscribeUrl: string;
}

export interface MarketingSender {
  send(email: MarketingEmail): Promise<void>;
}

/** Absolute links for one deployment; injected so domain code never reads env. */
export interface SubscriberUrls {
  confirm(token: string): string;
  unsubscribePage(token: string): string;
  oneClickUnsubscribe(token: string): string;
}
```

```ts
// src/domain/subscribers/confirmation-email.ts
import type { MarketingEmail } from "./sender";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildConfirmationEmail(input: {
  to: string;
  confirmUrl: string;
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
}): MarketingEmail {
  const text = [
    "Confirm you want Playoff Best Ball updates: one email a week through the NFL regular season, plus a heads-up when leagues open.",
    "",
    `Confirm: ${input.confirmUrl}`,
    "",
    "The link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us.",
    "",
    `Unsubscribe: ${input.unsubscribePageUrl}`,
  ].join("\n");

  const confirm = escapeHtml(input.confirmUrl);
  const unsubscribe = escapeHtml(input.unsubscribePageUrl);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#14161c;line-height:1.5">
<p>Confirm you want Playoff Best Ball updates: one email a week through the NFL regular season, plus a heads-up when leagues open.</p>
<p><a href="${confirm}" style="display:inline-block;background:#1b4fe8;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirm my email</a></p>
<p>Or paste this link into your browser:<br>${confirm}</p>
<p style="color:#5c6270">The link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us.</p>
<p style="color:#5c6270"><a href="${unsubscribe}" style="color:#5c6270">Unsubscribe</a></p>
</body></html>`;

  return {
    to: input.to,
    subject: "Confirm your Playoff Best Ball updates",
    text,
    html,
    oneClickUnsubscribeUrl: input.oneClickUnsubscribeUrl,
  };
}
```

```ts
// src/lib/site-url.ts
import type { SubscriberUrls } from "@/domain/subscribers/sender";

/** The production origin: canonical URLs, sitemap and metadataBase. Previews never use it. */
export const CANONICAL_ORIGIN = "https://playoffbestball.com";

/** This deployment's origin, for links inside emails (works on previews and locally). */
export function appOrigin(env: { BETTER_AUTH_URL?: string } = process.env): string {
  return (env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function subscriberUrls(origin: string = appOrigin()): SubscriberUrls {
  const q = (token: string) => `token=${encodeURIComponent(token)}`;
  return {
    confirm: (token) => `${origin}/subscribe/confirm?${q(token)}`,
    unsubscribePage: (token) => `${origin}/unsubscribe?${q(token)}`,
    oneClickUnsubscribe: (token) => `${origin}/api/unsubscribe?${q(token)}`,
  };
}
```

```ts
// src/lib/email/marketing.ts
import { Resend } from "resend";
import type { MarketingEmail, MarketingSender } from "@/domain/subscribers/sender";
import { DEMO_MODE_REQUESTED } from "@/lib/demo-mode";

/** The slice of the Resend client this module uses; tests pass a fake. */
export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      headers: Record<string, string>;
    }): Promise<{ error: { name: string; message: string } | null }>;
  };
}

/**
 * List mail only, from the news. subdomain so complaints about marketing mail
 * cannot hurt magic-link delivery on transactional. (spec §5.6). Every message
 * carries RFC 8058 one-click headers, which Gmail and Yahoo expect from bulk senders.
 */
export function createMarketingSender(opts: {
  resend: ResendLike | null;
  from: string | undefined;
  /** True where a missing config must fail loudly instead of logging (real production). */
  mustSend: boolean;
  log?: (line: string) => void;
}): MarketingSender {
  const log = opts.log ?? ((line: string) => console.log(line));
  return {
    async send(email: MarketingEmail) {
      if (opts.resend && opts.from) {
        const { error } = await opts.resend.emails.send({
          from: opts.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: {
            "List-Unsubscribe": `<${email.oneClickUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        if (error) throw new Error(`marketing email to ${email.to} failed: ${error.name}: ${error.message}`);
        return;
      }
      if (opts.mustSend) {
        throw new Error("RESEND_API_KEY and MARKETING_FROM_EMAIL must both be set to send list email in production");
      }
      // Same convention as magic links in src/lib/auth.ts: dev and the demo log instead of sending.
      log(`[dev] marketing email to ${email.to}: ${email.subject}\n${email.text}`);
    },
  };
}

let cached: MarketingSender | null = null;

export function getMarketingSender(): MarketingSender {
  cached ??= createMarketingSender({
    resend: process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null,
    // `||` not `??`: .env.example ships the var as "", which must count as unset.
    from: process.env.MARKETING_FROM_EMAIL || undefined,
    mustSend: process.env.NODE_ENV === "production" && !DEMO_MODE_REQUESTED,
  });
  return cached;
}
```

In `.env.example`, add a line after `NOTIFY_FROM_EMAIL=`:

```
MARKETING_FROM_EMAIL=
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/confirmation-email.test.ts src/lib/site-url.test.ts src/lib/email/marketing.test.ts && npm run typecheck`
Expected: 8 passed, and typecheck exits 0. If `new Resend(...)` is not assignable to `ResendLike`, narrow `ResendLike` to Resend's real `send` parameter type. Don't cast.

- [ ] **Step 5: Commit**

```bash
git add src/domain/subscribers/sender.ts src/domain/subscribers/confirmation-email.ts src/domain/subscribers/confirmation-email.test.ts src/lib/site-url.ts src/lib/site-url.test.ts src/lib/email/marketing.ts src/lib/email/marketing.test.ts .env.example
git commit -m "feat: marketing sender with one-click unsubscribe headers, confirmation email

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A4: `requestSubscription`, the signup state machine

**Files:**
- Create: `src/domain/subscribers/subscribe.ts`
- Test: `src/domain/subscribers/subscribe.test.ts`, `src/domain/subscribers/test-support.ts` (shared fakes for this folder's tests)

**Interfaces:**
- Consumes: Task A2 helpers; Task A3 `MarketingSender`, `SubscriberUrls`, `buildConfirmationEmail`.
- Produces:
  - `requestSubscription(db: PrismaClient, sender: MarketingSender, urls: SubscriberUrls, input: { email: string; source: SubscribeSource; now: Date }): Promise<{ outcome: "sent" | "throttled" | "already_active"; subscriberId: string }>`
  - `class ConfirmationEmailFailedError extends Error` (its `cause` is the send error)
  - `RESEND_THROTTLE_MS = 600_000`
  - `test-support.ts`: `fakeSender()`, `TEST_URLS`, `tokenFromEmail(email)`, `at(minutes)`

- [ ] **Step 1: Write the test support and the failing test**

```ts
// src/domain/subscribers/test-support.ts
import type { MarketingEmail, MarketingSender, SubscriberUrls } from "./sender";

export const TEST_URLS: SubscriberUrls = {
  confirm: (t) => `https://x.test/subscribe/confirm?token=${t}`,
  unsubscribePage: (t) => `https://x.test/unsubscribe?token=${t}`,
  oneClickUnsubscribe: (t) => `https://x.test/api/unsubscribe?token=${t}`,
};

/** Records sent mail; failNext() makes the next send throw like a Resend outage. */
export function fakeSender() {
  const sent: MarketingEmail[] = [];
  let failNext = false;
  const sender: MarketingSender = {
    async send(email) {
      if (failNext) {
        failNext = false;
        throw new Error("resend down");
      }
      sent.push(email);
    },
  };
  return { sender, sent, failNext: () => void (failNext = true) };
}

/** The raw confirm token from a confirmation email's text. */
export function tokenFromEmail(email: MarketingEmail): string {
  const match = email.text.match(/https:\/\/x\.test\/subscribe\/confirm\?token=(\S+)/);
  if (!match) throw new Error("no confirm link in email");
  return match[1];
}

const T0 = Date.parse("2026-10-20T12:00:00Z");
/** A fixed clock: at(0) is T0, at(11) is eleven minutes later. */
export const at = (minutes: number) => new Date(T0 + minutes * 60_000);
```

```ts
// src/domain/subscribers/subscribe.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { requestSubscription, ConfirmationEmailFailedError } from "./subscribe";
import { hashToken, newToken } from "./tokens";
import { at, fakeSender, TEST_URLS, tokenFromEmail } from "./test-support";

const subscribe = (sender: ReturnType<typeof fakeSender>["sender"], email: string, minutes = 0, source = "footer" as const) =>
  requestSubscription(testDb, sender, TEST_URLS, { email, source, now: at(minutes) });

describe("requestSubscription", () => {
  beforeEach(resetDb);

  it("creates a PENDING row and emails a confirm link that matches the stored hash", async () => {
    const mail = fakeSender();
    const result = await subscribe(mail.sender, "fan@example.com");

    expect(result.outcome).toBe("sent");
    const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    expect(row.status).toBe("PENDING");
    expect(row.source).toBe("footer");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("fan@example.com");
    expect(hashToken(tokenFromEmail(mail.sent[0]))).toBe(row.confirmTokenHash);
    expect(mail.sent[0].oneClickUnsubscribeUrl).toBe(TEST_URLS.oneClickUnsubscribe(row.unsubscribeToken));
  });

  it("treats case and whitespace variants as one address, throttling the repeat", async () => {
    const mail = fakeSender();
    await subscribe(mail.sender, "  Fan@Example.COM ");
    const again = await subscribe(mail.sender, "fan@example.com", 5);

    expect(again.outcome).toBe("throttled");
    expect(await testDb.emailSubscriber.count()).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it("resends with a fresh token once the 10-minute throttle has passed", async () => {
    const mail = fakeSender();
    await subscribe(mail.sender, "fan@example.com");
    const before = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    const again = await subscribe(mail.sender, "fan@example.com", 11);

    expect(again.outcome).toBe("sent");
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    expect(after.confirmTokenHash).not.toBe(before.confirmTokenHash);
    expect(mail.sent).toHaveLength(2);
  });

  it("sends nothing to an address that is already ACTIVE", async () => {
    await testDb.emailSubscriber.create({
      data: { email: "on@example.com", source: "footer", status: "ACTIVE", unsubscribeToken: newToken() },
    });
    const mail = fakeSender();
    const result = await subscribe(mail.sender, "on@example.com");

    expect(result.outcome).toBe("already_active");
    expect(mail.sent).toHaveLength(0);
  });

  it("makes an UNSUBSCRIBED address re-confirm, still respecting the throttle", async () => {
    await testDb.emailSubscriber.create({
      data: { email: "gone@example.com", source: "footer", status: "UNSUBSCRIBED", unsubscribeToken: newToken(), confirmSentAt: at(0) },
    });
    const mail = fakeSender();

    expect((await subscribe(mail.sender, "gone@example.com", 3)).outcome).toBe("throttled");
    expect((await subscribe(mail.sender, "gone@example.com", 30)).outcome).toBe("sent");
    const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "gone@example.com" } });
    expect(row.status).toBe("PENDING");
  });

  it("keeps the first source", async () => {
    const mail = fakeSender();
    await subscribe(mail.sender, "fan@example.com", 0, "footer");
    await requestSubscription(testDb, mail.sender, TEST_URLS, { email: "fan@example.com", source: "faq", now: at(30) });
    const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    expect(row.source).toBe("footer");
  });

  it("throws ConfirmationEmailFailedError on a failed send, and an immediate retry is not throttled", async () => {
    const mail = fakeSender();
    mail.failNext();
    await expect(subscribe(mail.sender, "fan@example.com")).rejects.toBeInstanceOf(ConfirmationEmailFailedError);

    const retry = await subscribe(mail.sender, "fan@example.com", 1);
    expect(retry.outcome).toBe("sent");
    expect(mail.sent).toHaveLength(1);
  });

  it("survives two first signups racing for one address", async () => {
    const mail = fakeSender();
    const results = await Promise.all([subscribe(mail.sender, "race@example.com"), subscribe(mail.sender, "race@example.com")]);

    expect(results.map((r) => r.outcome).sort()).toEqual(["sent", "throttled"]);
    expect(await testDb.emailSubscriber.count()).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/subscribe.test.ts`
Expected: FAIL. Cannot find module `./subscribe`.

- [ ] **Step 3: Implement**

```ts
// src/domain/subscribers/subscribe.ts
import { Prisma, type EmailSubscriber, type PrismaClient } from "@prisma/client";
import { buildConfirmationEmail } from "./confirmation-email";
import type { MarketingSender, SubscriberUrls } from "./sender";
import type { SubscribeSource } from "./sources";
import { hashToken, newToken, normalizeEmail } from "./tokens";

/** At most one confirmation email per address per window, so the form can't flood a stranger's inbox. */
export const RESEND_THROTTLE_MS = 10 * 60 * 1000;

export type SubscribeOutcome = "sent" | "throttled" | "already_active";

export class ConfirmationEmailFailedError extends Error {
  constructor(cause: unknown) {
    super("confirmation email failed to send", { cause });
    this.name = "ConfirmationEmailFailedError";
  }
}

/**
 * Form signup (spec §5.2). The caller must not reveal the outcome to the visitor:
 * all three outcomes look the same from outside.
 */
export async function requestSubscription(
  db: PrismaClient,
  sender: MarketingSender,
  urls: SubscriberUrls,
  input: { email: string; source: SubscribeSource; now: Date },
): Promise<{ outcome: SubscribeOutcome; subscriberId: string }> {
  const email = normalizeEmail(input.email);
  const existing = await db.emailSubscriber.findUnique({ where: { email } });

  if (!existing) {
    const token = newToken();
    let created: EmailSubscriber;
    try {
      created = await db.emailSubscriber.create({
        data: {
          email,
          source: input.source,
          status: "PENDING",
          confirmTokenHash: hashToken(token),
          confirmSentAt: input.now,
          unsubscribeToken: newToken(),
        },
      });
    } catch (err) {
      // Two first signups for one address race; the loser treats the winner's row as existing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return requestSubscription(db, sender, urls, input);
      }
      throw err;
    }
    await sendOrRollBack(db, sender, urls, created, token, null);
    return { outcome: "sent", subscriberId: created.id };
  }

  if (existing.status === "ACTIVE") return { outcome: "already_active", subscriberId: existing.id };

  if (existing.confirmSentAt && input.now.getTime() - existing.confirmSentAt.getTime() < RESEND_THROTTLE_MS) {
    return { outcome: "throttled", subscriberId: existing.id };
  }

  // PENDING (an old or lost link) or UNSUBSCRIBED (consent must be re-proven): new token, back to PENDING.
  const token = newToken();
  const previousSentAt = existing.confirmSentAt;
  const updated = await db.emailSubscriber.update({
    where: { id: existing.id },
    data: { status: "PENDING", confirmTokenHash: hashToken(token), confirmSentAt: input.now },
  });
  await sendOrRollBack(db, sender, urls, updated, token, previousSentAt);
  return { outcome: "sent", subscriberId: updated.id };
}

async function sendOrRollBack(
  db: PrismaClient,
  sender: MarketingSender,
  urls: SubscriberUrls,
  row: EmailSubscriber,
  token: string,
  previousSentAt: Date | null,
): Promise<void> {
  try {
    await sender.send(
      buildConfirmationEmail({
        to: row.email,
        confirmUrl: urls.confirm(token),
        unsubscribePageUrl: urls.unsubscribePage(row.unsubscribeToken),
        oneClickUnsubscribeUrl: urls.oneClickUnsubscribe(row.unsubscribeToken),
      }),
    );
  } catch (err) {
    // Un-stamp the send, so the throttle doesn't block an immediate retry of mail that never left.
    await db.emailSubscriber.update({ where: { id: row.id }, data: { confirmSentAt: previousSentAt } });
    throw new ConfirmationEmailFailedError(err);
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/subscribe.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/subscribers/subscribe.ts src/domain/subscribers/subscribe.test.ts src/domain/subscribers/test-support.ts
git commit -m "feat: requestSubscription — double opt-in signup with a per-address throttle

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A5: Confirm, unsubscribe and resubscribe

**Files:**
- Create: `src/domain/subscribers/confirm.ts`, `src/domain/subscribers/unsubscribe.ts`
- Test: `src/domain/subscribers/confirm.test.ts`, `src/domain/subscribers/unsubscribe.test.ts`

**Interfaces:**
- Consumes: A2 `isWellFormedToken`, `hashToken`; A4 `requestSubscription` and `test-support` (tests only).
- Produces:
  - `confirmSubscription(db, { token: unknown; now: Date }): Promise<ConfirmResult>`, where `ConfirmResult` is one of:
    - `{ result: "confirmed"; subscriberId: string; source: string }`
    - `{ result: "already_confirmed" }`
    - `{ result: "expired" }`
    - `{ result: "invalid" }`
  - `CONFIRM_TTL_MS`
  - `unsubscribeByToken(db, { token: unknown; now: Date }): Promise<{ result: "unsubscribed"; subscriberId: string } | { result: "already_unsubscribed" } | { result: "invalid" }>`
  - `resubscribeByToken(db, { token: unknown; now: Date }): Promise<{ result: "resubscribed"; subscriberId: string } | { result: "already_active" } | { result: "invalid" }>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/subscribers/confirm.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { requestSubscription } from "./subscribe";
import { confirmSubscription, CONFIRM_TTL_MS } from "./confirm";
import { unsubscribeByToken } from "./unsubscribe";
import { newToken } from "./tokens";
import { at, fakeSender, TEST_URLS, tokenFromEmail } from "./test-support";

async function pending(email = "fan@example.com") {
  const mail = fakeSender();
  await requestSubscription(testDb, mail.sender, TEST_URLS, { email, source: "footer", now: at(0) });
  const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email } });
  return { token: tokenFromEmail(mail.sent[0]), row };
}

describe("confirmSubscription", () => {
  beforeEach(resetDb);

  it("activates a PENDING row and reports its source", async () => {
    const { token, row } = await pending();
    const outcome = await confirmSubscription(testDb, { token, now: at(5) });

    expect(outcome).toEqual({ result: "confirmed", subscriberId: row.id, source: "footer" });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.confirmedAt).toEqual(at(5));
  });

  it("is idempotent: a re-click says already confirmed", async () => {
    const { token } = await pending();
    await confirmSubscription(testDb, { token, now: at(5) });
    expect(await confirmSubscription(testDb, { token, now: at(9) })).toEqual({ result: "already_confirmed" });
  });

  it("survives a double-click: one confirms, the other is already confirmed, nothing throws", async () => {
    const { token } = await pending();
    const results = await Promise.all([
      confirmSubscription(testDb, { token, now: at(5) }),
      confirmSubscription(testDb, { token, now: at(5) }),
    ]);
    expect(results.map((r) => r.result).sort()).toEqual(["already_confirmed", "confirmed"]);
  });

  it("expires after 7 days and leaves the row PENDING", async () => {
    const { token, row } = await pending();
    const late = new Date(at(0).getTime() + CONFIRM_TTL_MS + 1);
    expect(await confirmSubscription(testDb, { token, now: late })).toEqual({ result: "expired" });
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
  });

  it("rejects malformed, truncated and unknown tokens without touching the database", async () => {
    const { token } = await pending();
    for (const bad of [undefined, null, "", "abc", token.slice(0, 20), "x".repeat(300), newToken()]) {
      expect(await confirmSubscription(testDb, { token: bad, now: at(5) })).toEqual({ result: "invalid" });
    }
  });

  it("never lets an old confirm link undo an unsubscribe", async () => {
    const { token, row } = await pending();
    await confirmSubscription(testDb, { token, now: at(5) });
    await unsubscribeByToken(testDb, { token: row.unsubscribeToken, now: at(10) });
    expect(await confirmSubscription(testDb, { token, now: at(11) })).toEqual({ result: "invalid" });
  });
});
```

```ts
// src/domain/subscribers/unsubscribe.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { resubscribeByToken, unsubscribeByToken } from "./unsubscribe";
import { newToken } from "./tokens";
import { at } from "./test-support";

async function row(status: "PENDING" | "ACTIVE" | "UNSUBSCRIBED", confirmedAt: Date | null = null) {
  return testDb.emailSubscriber.create({
    data: { email: `${status.toLowerCase()}@example.com`, source: "footer", status, unsubscribeToken: newToken(), confirmedAt },
  });
}

describe("unsubscribeByToken", () => {
  beforeEach(resetDb);

  it("unsubscribes an ACTIVE row, then reports already unsubscribed", async () => {
    const r = await row("ACTIVE", at(0));
    expect(await unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) })).toEqual({ result: "unsubscribed", subscriberId: r.id });
    expect(await unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(2) })).toEqual({ result: "already_unsubscribed" });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("UNSUBSCRIBED");
    expect(after.unsubscribedAt).toEqual(at(1));
  });

  it("also stops a PENDING signup (the link in the confirmation email)", async () => {
    const r = await row("PENDING");
    expect((await unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) })).result).toBe("unsubscribed");
  });

  it("survives a double-click", async () => {
    const r = await row("ACTIVE", at(0));
    const results = await Promise.all([
      unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) }),
      unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) }),
    ]);
    expect(results.map((x) => x.result).sort()).toEqual(["already_unsubscribed", "unsubscribed"]);
  });

  it("rejects malformed and unknown tokens", async () => {
    for (const bad of [undefined, "", "short", "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%", newToken()]) {
      expect(await unsubscribeByToken(testDb, { token: bad, now: at(1) })).toEqual({ result: "invalid" });
    }
  });
});

describe("resubscribeByToken", () => {
  beforeEach(resetDb);

  it("restores ACTIVE directly and keeps the original confirmation time", async () => {
    const r = await row("UNSUBSCRIBED", at(0));
    expect(await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) })).toEqual({ result: "resubscribed", subscriberId: r.id });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.confirmedAt).toEqual(at(0));
    expect(after.unsubscribedAt).toBeNull();
  });

  it("stamps confirmedAt for a row that was never confirmed (the token proves control of the inbox)", async () => {
    const r = await row("UNSUBSCRIBED", null);
    await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) });
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } })).confirmedAt).toEqual(at(5));
  });

  it("is a no-op for ACTIVE and rejects unknown tokens", async () => {
    const r = await row("ACTIVE", at(0));
    expect(await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) })).toEqual({ result: "already_active" });
    expect(await resubscribeByToken(testDb, { token: newToken(), now: at(5) })).toEqual({ result: "invalid" });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/confirm.test.ts src/domain/subscribers/unsubscribe.test.ts`
Expected: FAIL. Modules are not found.

- [ ] **Step 3: Implement**

```ts
// src/domain/subscribers/confirm.ts
import type { PrismaClient } from "@prisma/client";
import { hashToken, isWellFormedToken } from "./tokens";

export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ConfirmResult =
  | { result: "confirmed"; subscriberId: string; source: string }
  | { result: "already_confirmed" }
  | { result: "expired" }
  | { result: "invalid" };

/**
 * Confirm button POST (spec §5.3). The hash is deliberately kept after confirming
 * (see the plan's spec clarifications), so a re-click or a double-click lands on
 * "you're on the list". Only a PENDING row can be confirmed, so an old link never
 * reactivates an UNSUBSCRIBED one.
 */
export async function confirmSubscription(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<ConfirmResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { confirmTokenHash: hashToken(input.token) } });
  if (!row) return { result: "invalid" };
  if (row.status === "ACTIVE") return { result: "already_confirmed" };
  if (row.status === "UNSUBSCRIBED") return { result: "invalid" };
  if (!row.confirmSentAt || input.now.getTime() - row.confirmSentAt.getTime() > CONFIRM_TTL_MS) {
    return { result: "expired" };
  }
  // Conditional on PENDING: of two concurrent clicks, exactly one wins.
  const { count } = await db.emailSubscriber.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "ACTIVE", confirmedAt: input.now },
  });
  return count === 1 ? { result: "confirmed", subscriberId: row.id, source: row.source } : { result: "already_confirmed" };
}
```

```ts
// src/domain/subscribers/unsubscribe.ts
import type { PrismaClient } from "@prisma/client";
import { isWellFormedToken } from "./tokens";

export type UnsubscribeResult =
  | { result: "unsubscribed"; subscriberId: string }
  | { result: "already_unsubscribed" }
  | { result: "invalid" };

/** Shared by the unsubscribe page's button and RFC 8058 one-click (spec §5.4). Repeats are harmless. */
export async function unsubscribeByToken(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<UnsubscribeResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { unsubscribeToken: input.token } });
  if (!row) return { result: "invalid" };
  const { count } = await db.emailSubscriber.updateMany({
    where: { id: row.id, status: { not: "UNSUBSCRIBED" } },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: input.now },
  });
  return count === 1 ? { result: "unsubscribed", subscriberId: row.id } : { result: "already_unsubscribed" };
}

export type ResubscribeResult =
  | { result: "resubscribed"; subscriberId: string }
  | { result: "already_active" }
  | { result: "invalid" };

/**
 * Undo for a mis-clicked unsubscribe. It goes straight back to ACTIVE with no
 * re-confirmation: the unsubscribe token was only ever sent to this inbox, so
 * holding it proves control of the address.
 */
export async function resubscribeByToken(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<ResubscribeResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { unsubscribeToken: input.token } });
  if (!row) return { result: "invalid" };
  if (row.status === "ACTIVE") return { result: "already_active" };
  await db.emailSubscriber.update({
    where: { id: row.id },
    data: { status: "ACTIVE", unsubscribedAt: null, confirmedAt: row.confirmedAt ?? input.now },
  });
  return { result: "resubscribed", subscriberId: row.id };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/`
Expected: every file in the folder passes. That is tokens (5), confirmation-email (2), subscribe (8), confirm (6) and unsubscribe (7).

- [ ] **Step 5: Commit**

```bash
git add src/domain/subscribers/confirm.ts src/domain/subscribers/confirm.test.ts src/domain/subscribers/unsubscribe.ts src/domain/subscribers/unsubscribe.test.ts
git commit -m "feat: confirm, unsubscribe and resubscribe — idempotent under double submits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A6: Account holders: linking, digest preference, auth hook

**Files:**
- Create: `src/domain/subscribers/account.ts`
- Modify: `src/lib/auth.ts` (add `databaseHooks` to the `betterAuth({...})` options)
- Test: `src/domain/subscribers/account.test.ts`

**Interfaces:**
- Consumes: A2 `newToken`, `normalizeEmail`, `ACCOUNT_SOURCE`.
- Produces:
  - `ensureAccountSubscriber(db, user: { id: string; email: string }, now?: Date): Promise<EmailSubscriber | null>`. It returns `null` only when the address is held by a different account.
  - `getDigestPreference(db, user: { id: string; email: string }): Promise<boolean>`
  - `setDigestPreference(db, user: { id: string; email: string }, enabled: boolean, now?: Date): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/subscribers/account.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { ensureAccountSubscriber, getDigestPreference, setDigestPreference } from "./account";
import { newToken } from "./tokens";
import { at } from "./test-support";

async function formRow(email: string, status: "PENDING" | "ACTIVE" | "UNSUBSCRIBED") {
  return testDb.emailSubscriber.create({ data: { email, source: "footer", status, unsubscribeToken: newToken() } });
}

describe("ensureAccountSubscriber", () => {
  beforeEach(resetDb);

  it("creates an ACTIVE account row for a new user", async () => {
    const user = await createTestUser("New");
    const row = await ensureAccountSubscriber(testDb, user, at(0));
    expect(row).toMatchObject({ userId: user.id, email: user.email.toLowerCase(), status: "ACTIVE", source: "account" });
  });

  it("is idempotent", async () => {
    const user = await createTestUser("Twice");
    const a = await ensureAccountSubscriber(testDb, user);
    const b = await ensureAccountSubscriber(testDb, user);
    expect(b?.id).toBe(a?.id);
    expect(await testDb.emailSubscriber.count()).toBe(1);
  });

  it("links a PENDING form signup and activates it, because signing in proves the address", async () => {
    const user = await createTestUser("Fan");
    await formRow(user.email.toLowerCase(), "PENDING");
    const row = await ensureAccountSubscriber(testDb, { id: user.id, email: `  ${user.email.toUpperCase()} ` }, at(0));
    expect(row).toMatchObject({ userId: user.id, status: "ACTIVE", source: "footer" });
  });

  it("links but never resubscribes an UNSUBSCRIBED address", async () => {
    const user = await createTestUser("Gone");
    await formRow(user.email.toLowerCase(), "UNSUBSCRIBED");
    const row = await ensureAccountSubscriber(testDb, user);
    expect(row).toMatchObject({ userId: user.id, status: "UNSUBSCRIBED" });
  });

  it("leaves an address held by a different account alone", async () => {
    const owner = await createTestUser("Owner");
    await ensureAccountSubscriber(testDb, owner);
    const other = await createTestUser("Other");
    expect(await ensureAccountSubscriber(testDb, { id: other.id, email: owner.email })).toBeNull();
  });
});

describe("digest preference", () => {
  beforeEach(resetDb);

  it("repairs a missing row and reports on-by-default", async () => {
    const user = await createTestUser("Missing");
    expect(await getDigestPreference(testDb, user)).toBe(true);
    expect(await testDb.emailSubscriber.count()).toBe(1);
  });

  it("turns off and back on", async () => {
    const user = await createTestUser("Toggle");
    expect(await setDigestPreference(testDb, user, false, at(1))).toBe(false);
    const off = await testDb.emailSubscriber.findUniqueOrThrow({ where: { userId: user.id } });
    expect(off).toMatchObject({ status: "UNSUBSCRIBED", unsubscribedAt: at(1) });

    expect(await setDigestPreference(testDb, user, true, at(2))).toBe(true);
    const on = await testDb.emailSubscriber.findUniqueOrThrow({ where: { userId: user.id } });
    expect(on).toMatchObject({ status: "ACTIVE", unsubscribedAt: null });
  });

  it("reports off, and changes nothing, when another account holds the address", async () => {
    const owner = await createTestUser("Owner");
    await ensureAccountSubscriber(testDb, owner);
    const other = { id: (await createTestUser("Other")).id, email: owner.email };
    expect(await getDigestPreference(testDb, other)).toBe(false);
    expect(await setDigestPreference(testDb, other, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/account.test.ts`
Expected: FAIL. Cannot find module `./account`.

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/subscribers/account.ts
import { Prisma, type EmailSubscriber, type PrismaClient } from "@prisma/client";
import { ACCOUNT_SOURCE } from "./sources";
import { newToken, normalizeEmail } from "./tokens";

type AccountUser = { id: string; email: string };

/**
 * The account holder's list row, creating or linking it (spec §5.5). Account holders
 * are on the digest by default, but an earlier unsubscribe is always respected.
 * Returns null only when the address belongs to a different account; that row is
 * left alone.
 */
export async function ensureAccountSubscriber(
  db: PrismaClient,
  user: AccountUser,
  now: Date = new Date(),
): Promise<EmailSubscriber | null> {
  const linked = await db.emailSubscriber.findUnique({ where: { userId: user.id } });
  if (linked) return linked;

  const email = normalizeEmail(user.email);
  const byEmail = await db.emailSubscriber.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.userId && byEmail.userId !== user.id) return null;
    return db.emailSubscriber.update({
      where: { id: byEmail.id },
      // Signing in proves the address, so a pending signup needs no confirm click.
      data: { userId: user.id, ...(byEmail.status === "PENDING" ? { status: "ACTIVE" as const, confirmedAt: now } : {}) },
    });
  }

  try {
    return await db.emailSubscriber.create({
      data: { email, userId: user.id, source: ACCOUNT_SOURCE, status: "ACTIVE", confirmedAt: now, unsubscribeToken: newToken() },
    });
  } catch (err) {
    // The create-user hook and a settings-page load can race; the second sees the first's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return ensureAccountSubscriber(db, user, now);
    }
    throw err;
  }
}

export async function getDigestPreference(db: PrismaClient, user: AccountUser): Promise<boolean> {
  const row = await ensureAccountSubscriber(db, user);
  return row?.status === "ACTIVE";
}

export async function setDigestPreference(
  db: PrismaClient,
  user: AccountUser,
  enabled: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await ensureAccountSubscriber(db, user, now);
  if (!row) return false;
  const updated = await db.emailSubscriber.update({
    where: { id: row.id },
    data: enabled
      ? { status: "ACTIVE", unsubscribedAt: null, confirmedAt: row.confirmedAt ?? now }
      : { status: "UNSUBSCRIBED", unsubscribedAt: now },
  });
  return updated.status === "ACTIVE";
}
```

- [ ] **Step 4: Wire the create-user hook**

In `src/lib/auth.ts`, add an import below the existing imports:

```ts
import { ensureAccountSubscriber } from "@/domain/subscribers/account";
```

Inside `betterAuth({ ... })`, add this property after the `database: prismaAdapter(...)` line:

```ts
  // Account holders are on the weekly digest by default (marketing spec §5.5). Never
  // allowed to fail sign-up: a missing row is repaired when the notification settings
  // page loads, and piece 3's digest sender backfills before each send.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await ensureAccountSubscriber(db, { id: user.id, email: user.email });
          } catch (err) {
            console.error(`[subscribers] could not create the digest row for user ${user.id}`, err);
          }
        },
      },
    },
  },
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers/account.test.ts && npm run typecheck`
Expected: 8 passed, and typecheck exits 0. The hook is covered end-to-end in Task A8.

- [ ] **Step 6: Commit**

```bash
git add src/domain/subscribers/account.ts src/domain/subscribers/account.test.ts src/lib/auth.ts
git commit -m "feat: account holders join the digest list on sign-up, respecting earlier unsubscribes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A7: API routes and analytics events

**Files:**
- Modify: `src/lib/analytics-events.ts`
- Create: `src/lib/analytics-client.ts`, `src/app/api/subscribe/route.ts`, `src/app/api/subscribe/confirm/route.ts`, `src/app/api/unsubscribe/route.ts`, `src/app/api/unsubscribe/undo/route.ts`, `src/app/api/me/digest/route.ts`
- Test: `src/app/api/subscribe/route.test.ts`, `src/app/api/unsubscribe/route.test.ts`

**Interfaces:**
- Consumes: A3 `getMarketingSender`, `subscriberUrls`; A4–A6 domain functions.
- Produces:
  - **Routes:**

    | Route | Request | Responses |
    |---|---|---|
    | `POST /api/subscribe` | JSON `{ email, source, website? }` | `200 {ok:true}`, `400 {error}`, `502 {error}` |
    | `POST /api/subscribe/confirm` | form `token` | 303 to `/subscribe/confirmed` or `/subscribe/confirm?status=expired\|invalid` |
    | `POST /api/unsubscribe` | page: form `token` | 303 to `/unsubscribe?token=…&status=unsubscribed\|invalid` |
    | `POST /api/unsubscribe` | one-click: `?token=` | `200 {ok:true}` or `404` |
    | `POST /api/unsubscribe/undo` | form `token` | 303 to `/unsubscribe?token=…&status=resubscribed`, or `/unsubscribe?status=invalid` |
    | `GET/PATCH /api/me/digest` | PATCH body `{ digest: boolean }` | `{ digest: boolean }` |

  - New keys on `ANALYTICS_EVENTS`: `MARKETING_CTA_CLICKED`, `SUBSCRIBE_SUBMITTED`, `SUBSCRIBE_CONFIRMED`, `UNSUBSCRIBED`, `INVITE_PAGE_VIEWED`
  - `captureClientEvent(event: AnalyticsEvent, properties?: Record<string, string | number | boolean>): void`

- [ ] **Step 1: Write the failing route tests**

```ts
// src/app/api/subscribe/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MarketingEmail } from "@/domain/subscribers/sender";
import { testDb, resetDb } from "../../../../tests/helpers/db";

const mail = vi.hoisted(() => ({ sent: [] as MarketingEmail[], fail: false }));
vi.mock("@/lib/email/marketing", () => ({
  getMarketingSender: () => ({
    async send(email: MarketingEmail) {
      if (mail.fail) throw new Error("resend down");
      mail.sent.push(email);
    },
  }),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/subscribe", () => {
  beforeEach(async () => {
    await resetDb();
    mail.sent.length = 0;
    mail.fail = false;
  });

  it("returns the same 200 for a new address and an already-active one", async () => {
    const first = await post({ email: "fan@example.com", source: "footer" });
    await testDb.emailSubscriber.update({ where: { email: "fan@example.com" }, data: { status: "ACTIVE" } });
    const second = await post({ email: "fan@example.com", source: "footer" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(await second.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
  });

  it("drops honeypot submissions behind a normal-looking 200", async () => {
    const res = await post({ email: "bot@example.com", source: "footer", website: "http://spam" });
    expect(res.status).toBe(200);
    expect(await testDb.emailSubscriber.count()).toBe(0);
  });

  it("rejects garbage with a 400 and a message, never a 500", async () => {
    for (const body of ["not json", { email: "nope", source: "footer" }, { email: `${"a".repeat(250)}@example.com`, source: "footer" }, { email: "fan@example.com", source: "account" }, {}]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toEqual(expect.any(String));
    }
  });

  it("returns 502 when the confirmation can't be sent, and a retry works", async () => {
    mail.fail = true;
    const failed = await post({ email: "fan@example.com", source: "footer" });
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toMatch(/couldn't send/i);

    mail.fail = false;
    expect((await post({ email: "fan@example.com", source: "footer" })).status).toBe(200);
    expect(mail.sent).toHaveLength(1);
  });
});
```

```ts
// src/app/api/unsubscribe/route.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../../tests/helpers/db";
import { newToken } from "@/domain/subscribers/tokens";
import { POST } from "./route";

async function active() {
  return testDb.emailSubscriber.create({
    data: { email: "fan@example.com", source: "footer", status: "ACTIVE", unsubscribeToken: newToken() },
  });
}

describe("POST /api/unsubscribe", () => {
  beforeEach(resetDb);

  it("handles RFC 8058 one-click: token in the query, form body, plain 200", async () => {
    const row = await active();
    const res = await POST(
      new Request(`http://localhost/api/unsubscribe?token=${row.unsubscribeToken}`, {
        method: "POST",
        body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UNSUBSCRIBED");
  });

  it("returns 404 to one-click for an unknown or mangled token", async () => {
    for (const token of [newToken(), "abc", ""]) {
      const res = await POST(new Request(`http://localhost/api/unsubscribe?token=${token}`, { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }) }));
      expect(res.status).toBe(404);
    }
  });

  it("redirects the page's button back to the page with a status", async () => {
    const row = await active();
    const res = await POST(new Request("http://localhost/api/unsubscribe", { method: "POST", body: new URLSearchParams({ token: row.unsubscribeToken }) }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost/unsubscribe?token=${row.unsubscribeToken}&status=unsubscribed`);
  });

  it("redirects a mangled page token to the not-recognized state", async () => {
    const res = await POST(new Request("http://localhost/api/unsubscribe", { method: "POST", body: new URLSearchParams({ token: "trunc" }) }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribe?token=trunc&status=invalid");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx dotenv -e .env.test -- npx vitest run src/app/api/subscribe/route.test.ts src/app/api/unsubscribe/route.test.ts`
Expected: FAIL. Cannot find module `./route`.

- [ ] **Step 3: Add the analytics events and client helper**

In `src/lib/analytics-events.ts`, add these keys inside `ANALYTICS_EVENTS`, after `DUES_INTEREST`:

```ts
  MARKETING_CTA_CLICKED: "marketing_cta_clicked",
  SUBSCRIBE_SUBMITTED: "subscribe_submitted",
  SUBSCRIBE_CONFIRMED: "subscribe_confirmed",
  UNSUBSCRIBED: "unsubscribed",
  INVITE_PAGE_VIEWED: "invite_page_viewed",
```

Update the file's doc comment, replacing its second line with:
` * funnel = create/join → draft → upgrade; the dues-collection fake door; and the marketing list (visit → subscribe → confirm).`

```ts
// src/lib/analytics-client.ts
"use client";

import posthog from "posthog-js";
import type { AnalyticsEvent } from "./analytics-events";

/** Browser-side custom events. Never throws: analytics must not break a click. */
export function captureClientEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  try {
    posthog.capture(event, properties);
  } catch (err) {
    console.error("[analytics] client capture failed", err);
  }
}
```

- [ ] **Step 4: Implement the routes**

```ts
// src/app/api/subscribe/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMarketingSender } from "@/lib/email/marketing";
import { subscriberUrls } from "@/lib/site-url";
import { ConfirmationEmailFailedError, requestSubscription } from "@/domain/subscribers/subscribe";
import { SUBSCRIBE_SOURCES } from "@/domain/subscribers/sources";

const bodySchema = z.object({
  email: z.string().trim().max(254, "That email address is too long").pipe(z.email("Enter a valid email address")),
  source: z.enum(SUBSCRIBE_SOURCES),
  /** Honeypot: hidden from people, filled in by naive bots. */
  website: z.string().optional(),
});

const OK = { ok: true } as const;

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Indistinguishable from success, so a bot learns nothing.
  if (parsed.data.website) return NextResponse.json(OK);

  try {
    await requestSubscription(db, getMarketingSender(), subscriberUrls(), {
      email: parsed.data.email,
      source: parsed.data.source,
      now: new Date(),
    });
  } catch (err) {
    if (err instanceof ConfirmationEmailFailedError) {
      console.error("[subscribe] confirmation email failed", err.cause);
      return NextResponse.json({ error: "We couldn't send the confirmation email — try again." }, { status: 502 });
    }
    throw err;
  }
  // The same response whatever the outcome: the form must not reveal who is on the list.
  return NextResponse.json(OK);
}
```

```ts
// src/app/api/subscribe/confirm/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { confirmSubscription } from "@/domain/subscribers/confirm";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/** The confirm page's button posts here (a plain form, so it works without JavaScript). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const outcome = await confirmSubscription(db, { token: form?.get("token"), now: new Date() });

  if (outcome.result === "confirmed") {
    // Awaited but can never throw (captureServerEvent swallows errors).
    await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.SUBSCRIBE_CONFIRMED, { source: outcome.source });
  }
  const target =
    outcome.result === "confirmed" || outcome.result === "already_confirmed"
      ? "/subscribe/confirmed"
      : `/subscribe/confirm?status=${outcome.result}`;
  return NextResponse.redirect(new URL(target, req.url), 303);
}
```

```ts
// src/app/api/unsubscribe/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unsubscribeByToken } from "@/domain/subscribers/unsubscribe";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * Two callers:
 *  - the /unsubscribe page's button: form field `token`, answered with a 303 back to the page
 *  - mail clients' one-click (RFC 8058): token in the query string, body
 *    `List-Unsubscribe=One-Click`, answered with a bare 200/404 and no page
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const formToken = form?.get("token");

  if (typeof formToken === "string") {
    const outcome = await unsubscribeByToken(db, { token: formToken, now: new Date() });
    if (outcome.result === "unsubscribed") {
      await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.UNSUBSCRIBED, { via: "link" });
    }
    const status = outcome.result === "invalid" ? "invalid" : "unsubscribed";
    return NextResponse.redirect(
      new URL(`/unsubscribe?token=${encodeURIComponent(formToken)}&status=${status}`, req.url),
      303,
    );
  }

  const outcome = await unsubscribeByToken(db, { token: new URL(req.url).searchParams.get("token"), now: new Date() });
  if (outcome.result === "invalid") return NextResponse.json({ error: "Unknown unsubscribe link" }, { status: 404 });
  if (outcome.result === "unsubscribed") {
    await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.UNSUBSCRIBED, { via: "one_click" });
  }
  return NextResponse.json({ ok: true });
}
```

```ts
// src/app/api/unsubscribe/undo/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resubscribeByToken } from "@/domain/subscribers/unsubscribe";

/** The "Resubscribe" button on /unsubscribe after a mis-click. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const outcome = await resubscribeByToken(db, { token, now: new Date() });
  const target =
    outcome.result === "invalid"
      ? "/unsubscribe?status=invalid"
      : `/unsubscribe?token=${encodeURIComponent(String(token))}&status=resubscribed`;
  return NextResponse.redirect(new URL(target, req.url), 303);
}
```

```ts
// src/app/api/me/digest/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getDigestPreference, setDigestPreference } from "@/domain/subscribers/account";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const bodySchema = z.object({ digest: z.boolean() });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ digest: await getDigestPreference(db, user) });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const digest = await setDigestPreference(db, user, parsed.data.digest);
  if (!parsed.data.digest) {
    await captureServerEvent(user.id, ANALYTICS_EVENTS.UNSUBSCRIBED, { via: "settings" });
  }
  return NextResponse.json({ digest });
}
```

- [ ] **Step 5: Run the tests, then typecheck and lint**

Run: `npx dotenv -e .env.test -- npx vitest run src/app/api/ && npm run typecheck && npm run lint`
Expected: 8 passed (subscribe 4, unsubscribe 4); typecheck and lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics-events.ts src/lib/analytics-client.ts src/app/api/subscribe src/app/api/unsubscribe src/app/api/me/digest
git commit -m "feat: subscribe, confirm, unsubscribe (incl. RFC 8058 one-click) and digest-preference routes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A8: Digest toggle in notification settings

**Files:**
- Create: `src/components/digest-toggle.tsx`, `e2e/digest-settings.spec.ts`
- Modify: `src/app/settings/notifications/page.tsx`

**Interfaces:**
- Consumes: A6 `getDigestPreference`; A7 `PATCH /api/me/digest`.
- Produces: `<DigestToggle initial: boolean />`.

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/digest-settings.spec.ts
import { test, expect } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers/auth";

test("new accounts get the weekly digest by default and can turn it off", async ({ page }) => {
  // Mixed case on purpose: the hook must normalize it (better-auth may also lowercase it first; either way one row).
  await signUp(page, "Digest", uniqueEmail("DiGeSt"));
  await page.goto("/settings/notifications");

  const toggle = page.getByLabel(/weekly playoff-race digest/i);
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/weekly playoff-race digest/i)).not.toBeChecked();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Start Postgres (see Execution Environment). Then run: `npx playwright test e2e/digest-settings.spec.ts`
Expected: FAIL. The label "weekly playoff-race digest" is not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/digest-toggle.tsx
"use client";

import { useState } from "react";

/** Saves on change. This page is still chalk-styled, so it uses chalk tokens until the app converts. */
export function DigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    const previous = on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/digest", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ digest: next }),
      });
      if (res.ok) {
        setOn((await res.json()).digest);
      } else {
        setOn(previous);
        setError("Couldn't save that. Try again.");
      }
    } catch {
      setOn(previous);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={on}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Weekly playoff-race digest</span>
          <span className="block text-sm text-chalk-dim">
            One email a week through the regular season, plus a heads-up when leagues open.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-chalk-coral">
          {error}
        </p>
      )}
    </div>
  );
}
```

In `src/app/settings/notifications/page.tsx`:
- Add the imports `import { getDigestPreference } from "@/domain/subscribers/account";` and `import { DigestToggle } from "@/components/digest-toggle";`.
- After `const settings = await getNotificationSettings(db, user.id);` add `const digest = await getDigestPreference(db, user);`.
- After `<NotificationSettingsForm initial={settings} />` add:

```tsx
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Email</h2>
          <DigestToggle initial={digest} />
        </section>
```

- [ ] **Step 4: Run the e2e test and confirm it passes**

Run: `npx playwright test e2e/digest-settings.spec.ts`
Expected: 1 passed, which proves the create-user hook from A6 end to end.

- [ ] **Step 5: Commit**

```bash
git add src/components/digest-toggle.tsx src/app/settings/notifications/page.tsx e2e/digest-settings.spec.ts
git commit -m "feat: weekly digest toggle in notification settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task A9: Runbook, full verification, PR 1

**Files:**
- Modify: `docs/runbooks/production-setup.md` (§3 Required table, §6 Resend)

- [ ] **Step 1: Document the new sender**

In `docs/runbooks/production-setup.md` §3, add this row to the **Required** table after `RESEND_API_KEY`:

```markdown
| `MARKETING_FROM_EMAIL` | List mail sender on the news subdomain, e.g. `Playoff Best Ball <hello@news.playoffbestball.com>` (step 6). Without it, production signups return 502 — the subscribe form is broken |
```

In §6, append:

```markdown
### Marketing sender (news subdomain)

List mail (signup confirmations now, the weekly digest later) sends from its own
subdomain, so that complaints about marketing mail cannot hurt magic-link delivery on
`transactional.`.

1. In Resend → Domains, add `news.playoffbestball.com`. Add the SPF, DKIM and DMARC
   records it shows in Route 53, then wait for "Verified".
2. Set `MARKETING_FROM_EMAIL=Playoff Best Ball <hello@news.playoffbestball.com>` in Doppler
   (it syncs to Vercel).
3. Smoke test: submit the footer form on production with an address you control. The
   email should arrive from `news.`, and Gmail should show an "Unsubscribe" link next to
   the sender (that is the `List-Unsubscribe` header working).
```

- [ ] **Step 2: Run the full CI mirror**

Run the "Full CI mirror" block from Execution Environment.
Expected: every step passes. Report the counts: vitest files and tests, and e2e passed.

- [ ] **Step 3: Commit, push, open PR 1**

```bash
git add docs/runbooks/production-setup.md
git commit -m "docs: runbook for the marketing sender subdomain

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/marketing-foundation
gh pr create --base main --title "feat: marketing list backend (piece 1, PR 1 of 3)" --body "$(cat <<'EOF'
Piece 1 of the year-round plan — spec: `docs/superpowers/specs/2026-10-09-marketing-foundation-design.md`, plan: `docs/superpowers/plans/2026-10-09-marketing-foundation.md` (both in this PR).

This PR: the list backend. `EmailSubscriber` (one row per address; account holders backfilled ACTIVE), double opt-in signup with a per-address throttle, confirm/unsubscribe/resubscribe (RFC 8058 one-click included), the create-user hook, and the digest toggle in notification settings. No public pages yet — PR 2 adds them.

Operator step before PR 2 ships pages: verify `news.playoffbestball.com` in Resend and set `MARKETING_FROM_EMAIL` (runbook §6).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Phase B — Marketing pages (branch `feat/marketing-pages`, from Phase A's tip)

### Task B1: Bring in cobalt (#42); light theme, error token, contrast check in CI

**Files:**
- Modify: `src/app/globals.css`, `scripts/check-contrast.mjs`, `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  - the CSS class `.theme-light` (paints `--ground` with `--ink` text)
  - the token `--bad` and Tailwind color `bad` (`text-bad`)
  - link focus rings inside `.theme-light`
  - `npm run check:contrast`

- [ ] **Step 1: Branch and merge `main`, which must already contain #42**

```bash
git checkout -b feat/marketing-pages
git fetch origin
git log origin/main --oneline | grep -i "cobalt design system" || { echo "STOP: #42 is not merged into main yet"; exit 1; }
git merge origin/main
```

If `tests/helpers/db.ts` conflicts, take #42's `resetDb` (TRUNCATE of every public table). It covers `EmailSubscriber` automatically, so drop A1's `deleteMany` line. Run `npx dotenv -e .env.test -- npx vitest run src/domain/subscribers` and confirm it still passes.

- [ ] **Step 2: Add the failing contrast checks**

In `scripts/check-contrast.mjs`, inside the `for (const [theme, T] of ...)` loop, add these checks after the line `check(theme, "warn on surface", T.warn, T.surface, 4.5);`:

```js
  // Errors (failed sends, invalid input). Amber --warn reads as a warning, not a failure.
  check(theme, "bad on surface", T.bad, T.surface, 4.5);
  check(theme, "bad on ground", T.bad, T.ground, 4.5);
  // The hovered primary button's label, a pair the gate previously skipped.
  check(theme, "brand-on over brand-hover fill", T["brand-on"], T["brand-hover"], 4.5);
  // Text inside tinted callouts (marketing key dates, on-clock banners).
  check(theme, "ink on brand-tint", T.ink, T["brand-tint"], 4.5);
  check(theme, "ink-soft on brand-tint", T["ink-soft"], T["brand-tint"], 4.5);
  // 1.4.11: link focus ring on the page ground.
  check(theme, "brand focus ring on ground", T.brand, T.ground, 3);
```

Run: `node scripts/check-contrast.mjs`
Expected: FAIL. The two "bad on …" rows per theme report `missing token`, and the script exits 1.

- [ ] **Step 3: Add the tokens and the light scope**

In `src/app/globals.css`:
- In the `:root` block that holds the cobalt tokens, after `--warn: #b45309;`, add `  --bad: #b42318;   /* errors: failed sends, invalid input */`.
- In `.theme-dark`, after `--warn: #fbbf24;`, add `  --bad: #f97066;`.
- In `@theme inline`, after `--color-warn: var(--warn);`, add `  --color-bad: var(--bad);`.
- In `@layer components`, directly before the `.card {` rule, add:

```css
  /* Light cobalt ground for converted pages (marketing first). It sits over the chalk
     body background and grain, so it paints its own ground. */
  .theme-light {
    background: var(--ground);
    color: var(--ink);
  }
```

- Change the focus-ring selector list from `.theme-dark a:focus-visible {` to cover both converted scopes, and update the comment above it:

```css
  /* Bare links only inside converted scopes: outside them --brand is #1b4fe8, ~1.8:1
     on the chalk pages' asphalt and under the 3:1 a focus ring needs, so those
     pages keep the browser's ring. Widens as the rest of the app converts. */
  .btn:focus-visible,
  .input:focus-visible,
  .theme-dark a:focus-visible,
  .theme-light a:focus-visible {
```

- [ ] **Step 4: Run the contrast check and confirm it passes**

Run: `node scripts/check-contrast.mjs`
Expected: every row is PASS, ending with "0 failing". (Measured during planning: `--bad` light is about 6.6:1 on surface and dark about 6.3:1.)

- [ ] **Step 5: Wire it into npm and CI**

In `package.json` `scripts`, add after `"lint": "eslint",`:

```json
    "check:contrast": "node scripts/check-contrast.mjs",
```

In `.github/workflows/ci.yml`, after `- run: npm run lint`, add:

```yaml
      - run: npm run check:contrast
```

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css scripts/check-contrast.mjs package.json .github/workflows/ci.yml
git commit -m "feat: cobalt light scope, error token, contrast gate in CI

The contrast script from #42 was never run by anything, so a token edit could ship
below AA with CI green. It now runs in CI, and also checks the pairs the marketing
pages render.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B2: Static-capable root layout, client-side identify, `/` redirect via proxy

**Files:**
- Modify: `src/app/layout.tsx`, `src/components/analytics-provider.tsx`
- Create: `src/proxy.ts`, `src/proxy.test.ts`, `e2e/marketing-redirect.spec.ts`
- Delete: the in-page redirect in `src/app/page.tsx` (the file moves in B4; for now, delete lines 2–3 and 8–9: the `redirect`/`getSessionUser` imports and the two-line session check)

**Interfaces:**
- Consumes: A3 `CANONICAL_ORIGIN`.
- Produces: `proxy(request: NextRequest): NextResponse` and `config = { matcher: "/" }`; `<AnalyticsIdentity />`, which takes no props.

- [ ] **Step 1: Write the failing tests**

```ts
// src/proxy.test.ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("sends a visitor with a session cookie from / to the dashboard", () => {
    const res = proxy(new NextRequest("http://localhost:3000/", { headers: { cookie: "better-auth.session_token=abc.def" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("recognizes the __Secure- cookie production sets over https", () => {
    const res = proxy(new NextRequest("https://playoffbestball.com/", { headers: { cookie: "__Secure-better-auth.session_token=abc.def" } }));
    expect(res.headers.get("location")).toBe("https://playoffbestball.com/dashboard");
  });

  it("lets signed-out visitors through to the static page", () => {
    const res = proxy(new NextRequest("http://localhost:3000/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("runs on the home page only", () => {
    expect(config.matcher).toBe("/");
  });
});
```

```ts
// e2e/marketing-redirect.spec.ts
import { test, expect } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers/auth";

test("a signed-in visitor to / lands on the dashboard", async ({ page }) => {
  await signUp(page, "Home", uniqueEmail("home"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx dotenv -e .env.test -- npx vitest run src/proxy.test.ts`
Expected: FAIL. Cannot find module `./proxy`. (Run the e2e test after Step 3. With the in-page redirect deleted, it would fail without the proxy.)

- [ ] **Step 3: Implement**

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * `/` is a static marketing page, so it cannot check the session itself without
 * becoming dynamic again. This is only an optimistic cookie-presence check:
 * /dashboard still validates the session, and a stale cookie ends at /sign-in, not
 * in a loop. Next 16 calls middleware "proxy" (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
```

```tsx
// src/components/analytics-provider.tsx
"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";

/**
 * Identifies signed-in users to PostHog from the browser. The root layout used to
 * pass the user down from a server-side session read, which made every page,
 * marketing included, render per request.
 */
export function AnalyticsIdentity() {
  const { data } = authClient.useSession();
  const user = data?.user;

  useEffect(() => {
    if (user) posthog.identify(user.id, { email: user.email, name: user.name });
  }, [user]);

  return null;
}
```

In `src/app/layout.tsx`, make three edits:
1. In the imports, replace `import { getSessionUser } from "@/lib/session";` with `import { CANONICAL_ORIGIN } from "@/lib/site-url";`.
2. Leave the three `const caveat/plexSans/plexMono = …` font declarations exactly as they are.
3. Replace everything from `export const metadata` to the end of the file with the block below.

The imports should end up as:

```tsx
import type { Metadata } from "next";
import { Caveat, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { ChalkFilter } from "@/components/chalk-filter";
import { AnalyticsIdentity } from "@/components/analytics-provider";
import { CANONICAL_ORIGIN } from "@/lib/site-url";
```

The replacement for everything from `export const metadata` to the end of the file:

```tsx

export const metadata: Metadata = {
  // Absolute URLs for canonical links and share images resolve against production.
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: "Playoff Best Ball",
  description: "Run an NFL playoff best ball league with your friends.",
};

// No session read here: it would make every route, marketing pages included, render
// per request. Pages that need the user call getSessionUser() themselves.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${caveat.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ChalkFilter />
        <PwaRegister />
        <AnalyticsIdentity />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx dotenv -e .env.test -- npx vitest run src/proxy.test.ts && npx playwright test e2e/marketing-redirect.spec.ts`
Expected: 4 passed and 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts src/app/layout.tsx src/components/analytics-provider.tsx src/app/page.tsx e2e/marketing-redirect.spec.ts
git commit -m "feat: root layout no longer reads the session; proxy redirects signed-in visitors from /

Reading the session in the root layout made every route dynamic, including pages
that should be static and served from the CDN.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B3: Launch phase and season calendar

**Files:**
- Create: `src/lib/launch.ts`, `src/lib/season-calendar.ts`
- Test: `src/lib/launch.test.ts`, `src/lib/season-calendar.test.ts`

**Interfaces:**
- Produces:
  - `SIGNUPS_OPEN_AT: Date`
  - `type LaunchPhase = "list" | "signups_open"`
  - `getLaunchPhase(now?: Date): LaunchPhase`
  - `SEASON_CALENDAR = { season: 2026, fieldSet: "2027-01-10", wildCardStart: "2027-01-16", wildCardEnd: "2027-01-18", superBowl: "2027-02-14" }`
  - `formatCalendarDay(isoDate: string): string`, which gives e.g. "Sun, Jan 10"

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/launch.test.ts
import { describe, it, expect } from "vitest";
import { getLaunchPhase, SIGNUPS_OPEN_AT } from "./launch";

describe("getLaunchPhase", () => {
  it("asks for the list before signups open, and for a league from that instant on", () => {
    expect(getLaunchPhase(new Date(SIGNUPS_OPEN_AT.getTime() - 1))).toBe("list");
    expect(getLaunchPhase(SIGNUPS_OPEN_AT)).toBe("signups_open");
    expect(getLaunchPhase(new Date(SIGNUPS_OPEN_AT.getTime() + 86_400_000))).toBe("signups_open");
  });
});
```

```ts
// src/lib/season-calendar.test.ts
import { describe, it, expect } from "vitest";
import { formatCalendarDay, SEASON_CALENDAR } from "./season-calendar";

describe("season calendar", () => {
  it("formats calendar days without timezone drift", () => {
    expect(formatCalendarDay(SEASON_CALENDAR.fieldSet)).toBe("Sun, Jan 10");
    expect(formatCalendarDay(SEASON_CALENDAR.wildCardStart)).toBe("Sat, Jan 16");
    expect(formatCalendarDay(SEASON_CALENDAR.superBowl)).toBe("Sun, Feb 14");
  });

  it("puts the field being set before Wild Card weekend", () => {
    expect(SEASON_CALENDAR.fieldSet < SEASON_CALENDAR.wildCardStart).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx dotenv -e .env.test -- npx vitest run src/lib/launch.test.ts src/lib/season-calendar.test.ts`
Expected: FAIL. Modules are not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/launch.ts
/**
 * When the homepage stops asking for an email and starts asking for a league
 * (spec §4.2). It is a reviewed code change, like pricing.ts. Mid-December is the
 * working assumption (spec §13); Nick sets the final date. The home page revalidates
 * hourly, so the switch happens within an hour without a redeploy.
 */
export const SIGNUPS_OPEN_AT = new Date("2026-12-14T14:00:00Z"); // Mon Dec 14, 9:00 ET

export type LaunchPhase = "list" | "signups_open";

export function getLaunchPhase(now: Date = new Date()): LaunchPhase {
  return now.getTime() >= SIGNUPS_OPEN_AT.getTime() ? "signups_open" : "list";
}
```

```ts
// src/lib/season-calendar.ts
/**
 * The dates the marketing pages quote. Checked against ESPN's 2026 calendar on
 * 2026-10-09; the v1 spec's "Wild Card ~Jan 9" was a week early. Calendar days in
 * US Eastern, stored as ISO dates so they render the same in every timezone.
 * One edit per season.
 */
export const SEASON_CALENDAR = {
  season: 2026,
  /** Week 18 ends and the playoff field is known. Drafts can start. */
  fieldSet: "2027-01-10",
  /** Wild Card kickoff. Drafts must be done. */
  wildCardStart: "2027-01-16",
  wildCardEnd: "2027-01-18",
  superBowl: "2027-02-14",
} as const;

/** "Sun, Jan 10". The ISO date is read as a calendar day, not a UTC instant. */
export function formatCalendarDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx dotenv -e .env.test -- npx vitest run src/lib/launch.test.ts src/lib/season-calendar.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/launch.ts src/lib/launch.test.ts src/lib/season-calendar.ts src/lib/season-calendar.test.ts
git commit -m "feat: launch phase switch and the season's key dates

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B4: Marketing shell and home page

**Files:**
- Create: `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx`, and in `src/components/marketing/`: `wordmark.tsx`, `marketing-header.tsx`, `marketing-footer.tsx`, `signup-form.tsx`, `cta-link.tsx`, `key-dates.tsx`, `steps.tsx`, `section.tsx`
- Create: `src/components/marketing/faq-content.ts`, `src/components/marketing/faq-list.tsx` (the home page shows an FAQ teaser; `/faq` and `/pricing` reuse these in B7)
- Delete: `src/app/page.tsx`. Also delete `src/components/chalk-play-diagram.tsx` if `grep -rn "chalk-play-diagram" src` finds no other importer.
- Test: `e2e/marketing-home.spec.ts`

**Interfaces:**
- Consumes: A2 `SubscribeSource`; A7 `captureClientEvent`, `ANALYTICS_EVENTS`; B3 `getLaunchPhase`, `SEASON_CALENDAR`, `formatCalendarDay`; `PREMIUM_PRICE_CENTS`, `formatPriceUsd`, `FREE_TIER_MAX_ENTRIES`, `PREMIUM_MAX_ENTRIES`.
- Produces:
  - `<SignupForm source: SubscribeSource; cta?: string; compact?: boolean />`
  - `<CtaLink href cta page phase className? />`
  - `<Section title? eyebrow? id? className? />`
  - `<KeyDates />`
  - `<Steps steps: { title: string; body: string }[] />`
  - `faqItems(): FaqItem[]`, where `FaqItem = { id: string; question: string; answer: string; category: "general" | "pricing" }`
  - `<FaqList items: FaqItem[] />`

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/marketing-home.spec.ts
import { test, expect } from "@playwright/test";
import { testDb } from "../tests/helpers/db";
import { getLaunchPhase } from "../src/lib/launch";
import { uniqueEmail } from "./helpers/auth";

test("home renders the pitch, the key dates and a phase-appropriate call to action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/draft once\. watch all playoffs\./i);
  await expect(page.getByText("Sun, Jan 10")).toBeVisible();
  await expect(page.getByText("Sat, Jan 16")).toBeVisible();
  if (getLaunchPhase() === "list") {
    await expect(page.getByRole("main").getByRole("button", { name: /get the weekly digest/i })).toBeVisible();
  } else {
    await expect(page.getByRole("main").getByRole("link", { name: /start your league/i })).toBeVisible();
  }
});

test("the footer signup confirms by email and stores a pending, lowercased address", async ({ page }) => {
  const email = uniqueEmail("Footer");
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel(/email address/i).fill(`  ${email.toUpperCase()}  `);
  await footer.getByRole("button", { name: /get the weekly digest/i }).click();
  await expect(footer.getByText(/check your inbox/i)).toBeVisible();

  const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  expect(row.status).toBe("PENDING");
  expect(row.source).toBe("footer");
});

test("the header's Sign in link takes a signed-out visitor to sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fdashboard|\/sign-in\?callbackURL=\/dashboard/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test e2e/marketing-home.spec.ts`
Expected: FAIL. The old chalk landing page has no "Sun, Jan 10" and no footer form.

- [ ] **Step 3: Build the shared components**

```tsx
// src/components/marketing/wordmark.tsx
export function Wordmark() {
  return (
    <span className="font-semibold tracking-tight text-ink">
      Playoff <span className="text-brand">Best Ball</span>
    </span>
  );
}
```

```tsx
// src/components/marketing/section.tsx
export function Section({
  title,
  eyebrow,
  id,
  className = "",
  children,
}: {
  title?: string;
  eyebrow?: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 ${className}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-brand">{eyebrow}</p>}
      {title && <h2 className="mt-1 text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">{title}</h2>}
      <div className={title ? "mt-8" : ""}>{children}</div>
    </section>
  );
}
```

```tsx
// src/components/marketing/signup-form.tsx
"use client";

import { useState } from "react";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { SubscribeSource } from "@/domain/subscribers/sources";

export function SignupForm({
  source,
  cta = "Get the weekly digest",
  compact = false,
}: {
  source: SubscribeSource;
  cta?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source, website: honeypot }),
      });
      if (res.ok) {
        setState("sent");
        captureClientEvent(ANALYTICS_EVENTS.SUBSCRIBE_SUBMITTED, { source });
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <p role="status" className="rounded-lg bg-brand-tint p-4 text-ink">
        Check your inbox to confirm. The link works for 7 days.
      </p>
    );
  }

  const id = `signup-${source}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-3 sm:flex-row"}>
        <label htmlFor={id} className="sr-only">
          Email address
        </label>
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="input sm:max-w-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {/* Honeypot: off-screen and out of the tab order; people never see it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Leave this empty
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary shrink-0" disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : cta}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
```

```tsx
// src/components/marketing/cta-link.tsx
"use client";

import Link from "next/link";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import type { LaunchPhase } from "@/lib/launch";

export function CtaLink({
  href,
  cta,
  page,
  phase,
  className = "btn btn-primary",
  children,
}: {
  href: string;
  cta: string;
  page: string;
  phase: LaunchPhase;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => captureClientEvent(ANALYTICS_EVENTS.MARKETING_CTA_CLICKED, { cta, page, phase })}>
      {children}
    </Link>
  );
}
```

```tsx
// src/components/marketing/key-dates.tsx
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";

const DATES = [
  { day: SEASON_CALENDAR.fieldSet, title: "Playoff field set", body: "Week 18 ends. Drafts open." },
  { day: SEASON_CALENDAR.wildCardStart, title: "Wild Card kickoff", body: "Drafts are done. Scoring starts." },
  { day: SEASON_CALENDAR.superBowl, title: "Super Bowl", body: "Most total points wins." },
];

export function KeyDates() {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {DATES.map((d) => (
        <li key={d.day} className="rounded-lg bg-brand-tint p-4">
          <p className="font-mono text-sm font-semibold text-brand">{formatCalendarDay(d.day)}</p>
          <p className="mt-1 font-semibold text-ink">{d.title}</p>
          <p className="text-sm text-ink-soft">{d.body}</p>
        </li>
      ))}
    </ol>
  );
}
```

```tsx
// src/components/marketing/steps.tsx
export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-6 md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="card p-6">
          <p className="font-mono text-sm font-semibold text-brand">{String(i + 1).padStart(2, "0")}</p>
          <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-ink-soft">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
```

```ts
// src/components/marketing/faq-content.ts
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "general" | "pricing";
}

/**
 * Every answer must be true of the code today. Numbers and dates come from the
 * constants the rules use, so the FAQ cannot drift from the product.
 */
export function faqItems(): FaqItem[] {
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);
  const fieldSet = formatCalendarDay(SEASON_CALENDAR.fieldSet);
  const wildCard = formatCalendarDay(SEASON_CALENDAR.wildCardStart);
  return [
    {
      id: "what",
      category: "general",
      question: "What is playoff best ball?",
      answer:
        "A fantasy league that covers only the NFL playoffs. You draft a nine-player roster once, before Wild Card weekend, and every player scores automatically each round his team is still alive. There are no lineups to set and no waivers. Most total points after the Super Bowl wins.",
    },
    {
      id: "when",
      category: "general",
      question: "When does the draft happen?",
      answer: `Between ${fieldSet}, when the playoff field is set, and Wild Card kickoff on ${wildCard}. The commissioner picks the start time. It's a slow draft, so nobody has to be online at the same time.`,
    },
    {
      id: "online",
      category: "general",
      question: "Do I have to be online for the draft?",
      answer:
        "No. Each pick has a clock of 2 to 24 hours, set by your commissioner, and you're notified by email (and by text or push if you turn them on) when you're up. If the clock runs out, autodraft picks for you: your top queued player if you've set a queue, otherwise the best available.",
    },
    {
      id: "eliminated",
      category: "general",
      question: "What happens when a player's team is eliminated?",
      answer: "He stops scoring. That's the strategy: players on teams that go deep score in more rounds.",
    },
    {
      id: "bye",
      category: "general",
      question: "What about the top seeds' bye?",
      answer:
        "The top seed in each conference skips Wild Card weekend, so its players can play at most three games instead of four. A great player on a bye team starts a round behind.",
    },
    {
      id: "injuries",
      category: "general",
      question: "What if a player gets hurt?",
      answer:
        "If your commissioner turns on substitutions, an injured player's points up to the injury count, plus his substitute's points afterward. It's off by default.",
    },
    {
      id: "money",
      category: "general",
      question: "Do you handle buy-ins or prize money?",
      answer:
        "No. Money never touches Playoff Best Ball. Commissioners can record an entry fee, show their Venmo handle, and mark who has paid.",
    },
    {
      id: "practice",
      category: "general",
      question: "Can I practice drafting?",
      answer: "Yes. Sign in and run a mock draft against bots any time. Nothing in a mock counts.",
    },
    {
      id: "stop-email",
      category: "general",
      question: "How do I stop the weekly email?",
      answer: "Use the unsubscribe link in any email, or turn off the weekly digest in your notification settings.",
    },
    {
      id: "cost",
      category: "pricing",
      question: "How much does it cost?",
      answer: `Joining a league is always free. Running one is free for up to ${FREE_TIER_MAX_ENTRIES} teams. Premium is ${price} per league, per season, paid once by the commissioner, and raises the cap to ${PREMIUM_MAX_ENTRIES} teams.`,
    },
    {
      id: "per-league",
      category: "pricing",
      question: "Is Premium per league or per person?",
      answer: "Per league. One payment covers that league for the season, for every member.",
    },
    {
      id: "renew",
      category: "pricing",
      question: "Does it renew?",
      answer: "No. It's a one-time charge for the season. There's no subscription to cancel.",
    },
    {
      id: "mid-season",
      category: "pricing",
      question: "Can I upgrade mid-season?",
      answer:
        "Yes, and Premium switches on straight away. Scoring changes apply to weeks already played, since points are worked out when standings are read, so check with your league before rewriting the rules in January.",
    },
    {
      id: "free-league",
      category: "pricing",
      question: "What happens to a free league?",
      answer: `Nothing changes. It keeps running with preset scoring and up to ${FREE_TIER_MAX_ENTRIES} teams.`,
    },
  ];
}
```

```tsx
// src/components/marketing/faq-list.tsx
import type { FaqItem } from "./faq-content";

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {items.map((item) => (
        <div key={item.id} id={item.id} className="grid gap-2 py-5 md:grid-cols-[2fr_3fr] md:gap-8">
          <dt className="font-semibold text-ink">{item.question}</dt>
          <dd className="text-ink-soft">{item.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
```

```tsx
// src/components/marketing/marketing-header.tsx
import Link from "next/link";
import { Wordmark } from "./wordmark";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/commissioners", label: "Commissioners" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingHeader() {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link href="/" className="text-lg" aria-label="Playoff Best Ball home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hidden min-h-11 items-center rounded px-3 text-ink-soft hover:text-ink md:inline-flex">
              {n.label}
            </Link>
          ))}
          {/* callbackURL=/dashboard: a signed-in visitor clicking this lands in the app, not on a form. */}
          <Link href="/sign-in?callbackURL=/dashboard" className="btn">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

```tsx
// src/components/marketing/marketing-footer.tsx
import Link from "next/link";
import { SignupForm } from "./signup-form";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/scoring", label: "Scoring" },
  { href: "/commissioners", label: "Commissioners" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/sign-in?callbackURL=/dashboard", label: "Sign in" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">The playoff race, once a week</h2>
          <p className="text-ink-soft">
            Through the regular season: whose playoff stock is rising, who clinched, who&apos;s out. Plus a
            heads-up the day leagues open.
          </p>
          <SignupForm source="footer" compact />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-6 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-sm text-ink-muted sm:px-6">
        © {new Date().getFullYear()} Playoff Best Ball. Not affiliated with the NFL.
      </p>
    </footer>
  );
}
```

```tsx
// src/app/(marketing)/layout.tsx
import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: { default: "Playoff Best Ball", template: "%s · Playoff Best Ball" },
  twitter: { card: "summary_large_image" },
};

// Every marketing page shows a launch-phase CTA (home hero, ClosingCta), so all of
// them re-render hourly. Otherwise the phase would freeze at build time and the CTA
// would never flip at SIGNUPS_OPEN_AT without a deploy (spec §4.2).
export const revalidate = 3600;

/**
 * Static by construction: nothing in this group may read cookies, headers or the
 * session (scripts/check-static-routes.mjs enforces it in CI).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light flex flex-1 flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
```

- [ ] **Step 4: Build the home page**

```tsx
// src/app/(marketing)/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { getLaunchPhase } from "@/lib/launch";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { SignupForm } from "@/components/marketing/signup-form";
import { CtaLink } from "@/components/marketing/cta-link";
import { KeyDates } from "@/components/marketing/key-dates";
import { Steps } from "@/components/marketing/steps";
import { Section } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq-list";
import { faqItems } from "@/components/marketing/faq-content";

// No `revalidate` here: the (marketing) layout sets it hourly for every page, so the
// hero CTA flips at SIGNUPS_OPEN_AT without a redeploy (spec §4.2).

export const metadata: Metadata = {
  title: { absolute: "Playoff Best Ball — draft once, watch all playoffs" },
  description:
    "Run an NFL playoff best ball league with your friends: a slow draft over a few days, then nothing to manage through the Super Bowl. Free for up to 10 teams.",
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Start a league, send one link",
    body: "Create a league in a couple of minutes and drop the invite link in your group chat. Joining is always free.",
  },
  {
    title: "Draft on your own time",
    body: "A slow snake draft: each pick has a 2- to 24-hour clock, and you're notified when you're up. The clock can pause overnight, and autodraft covers a missed turn.",
  },
  {
    title: "Watch it score itself",
    body: "No lineups, no waivers. All nine of your players score every round their team is alive. Most total points after the Super Bowl wins.",
  },
];

const WHY = [
  {
    title: "Every round counts",
    body: "Points from Wild Card weekend through the Super Bowl all add up, so a player whose team goes deep beats one big game.",
  },
  { title: "Nothing to manage", body: "Draft well, then watch. There's no start/sit decision and no waiver wire." },
  {
    title: "Byes and eliminations are the game",
    body: "Top seeds skip Wild Card weekend and every loss ends a season. Picking who plays the most games is the whole strategy.",
  },
];

export default function HomePage() {
  const phase = getLaunchPhase();
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);

  return (
    <>
      <Section className="pt-16 sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">NFL playoff best ball</p>
        <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          Draft once. Watch all playoffs.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-soft text-pretty sm:text-xl">
          Run a playoff best ball league with your friends. Everyone drafts on their own time over a few days,
          then there&apos;s nothing to manage: your players score every round their team survives, from Wild
          Card weekend to the Super Bowl.
        </p>
        <div className="mt-8 max-w-2xl">
          {phase === "list" ? (
            <>
              <SignupForm source="home_hero" />
              <p className="mt-3 text-sm text-ink-muted">
                Free. One email a week through the regular season, plus a heads-up when leagues open.
              </p>
            </>
          ) : (
            <>
              <CtaLink href="/leagues/new" cta="start_league" page="home" phase={phase}>
                Start your league
              </CtaLink>
              <p className="mt-3 text-sm text-ink-muted">
                Drafts open {formatCalendarDay(SEASON_CALENDAR.fieldSet)}, the day the playoff field is set.
                Free for up to {FREE_TIER_MAX_ENTRIES} teams.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section eyebrow="Key dates" title="Six days to draft, five weeks to watch">
        <KeyDates />
      </Section>

      <Section eyebrow="How it works" title="Three steps, then the playoffs do the work">
        <Steps steps={STEPS} />
        <p className="mt-6">
          <Link href="/how-it-works" className="font-semibold text-brand underline-offset-4 hover:underline">
            The full rules
          </Link>
        </p>
      </Section>

      <Section eyebrow="Why playoff best ball" title="Built for the six best weeks of the season">
        <ul className="grid gap-6 md:grid-cols-3">
          {WHY.map((w) => (
            <li key={w.title}>
              <h3 className="text-lg font-semibold">{w.title}</h3>
              <p className="mt-2 text-ink-soft">{w.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Pricing" title="Free to play">
        <p className="max-w-2xl text-lg text-ink-soft">
          Free for up to {FREE_TIER_MAX_ENTRIES} teams with standard, half-PPR or full-PPR scoring. Premium is{" "}
          {price} per league, per season, for custom scoring, up to {PREMIUM_MAX_ENTRIES} teams and projections.
        </p>
        <p className="mt-6">
          <Link href="/pricing" className="btn">
            See pricing
          </Link>
        </p>
      </Section>

      <Section eyebrow="Questions" title="The short version">
        <FaqList items={faqItems().filter((f) => ["what", "when", "online"].includes(f.id))} />
        <p className="mt-6">
          <Link href="/faq" className="font-semibold text-brand underline-offset-4 hover:underline">
            All questions
          </Link>
        </p>
      </Section>
    </>
  );
}
```

Then delete `src/app/page.tsx`. Run `grep -rn "chalk-play-diagram\|ChalkPlayDiagram" src`. If nothing matches, delete `src/components/chalk-play-diagram.tsx`.

- [ ] **Step 5: Run the e2e test, typecheck, lint and contrast**

Run: `npm run typecheck && npm run lint && npm run check:contrast && npx playwright test e2e/marketing-home.spec.ts e2e/marketing-redirect.spec.ts`
Expected: all exit 0, and 4 passed.

- [ ] **Step 6: Look at it**

Run `npm run dev`. Open `http://localhost:3000/` at 1280px wide and at 390px wide, and check:
- the light ground covers the whole page, with no asphalt showing behind the content;
- the header Sign in button and footer links are at least 44px tall;
- there is no horizontal scroll at 390px.

Fix anything off before committing.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(marketing)" src/components/marketing e2e/marketing-home.spec.ts
git rm src/app/page.tsx
# also git rm src/components/chalk-play-diagram.tsx if it was deleted
git commit -m "feat: cobalt marketing shell and home page with the list-first CTA

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B5: `/how-it-works` and `/commissioners`

**Files:**
- Create: `src/app/(marketing)/how-it-works/page.tsx`, `src/app/(marketing)/commissioners/page.tsx`, `src/components/marketing/closing-cta.tsx`
- Test: `e2e/marketing-pages.spec.ts` (this task creates it; B6 and B7 extend it)

**Interfaces:**
- Consumes: B4 components; `getLaunchPhase`; `SEASON_CALENDAR`; `DEFAULT_ROSTER_SLOTS`, `FLEX_ELIGIBLE`, `FREE_TIER_MAX_ENTRIES`, `PREMIUM_MAX_ENTRIES`, `pickClockHoursSchema`.
- Produces: `<ClosingCta page: string; source: SubscribeSource />`

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/marketing-pages.spec.ts
import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/how-it-works", h1: /how playoff best ball works/i, title: /How it works · Playoff Best Ball/ },
  { path: "/commissioners", h1: /run the league, skip the spreadsheet/i, title: /Commissioners · Playoff Best Ball/ },
];

for (const p of PAGES) {
  test(`${p.path} renders with its own title and canonical link`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://playoffbestball.com${p.path}`);
  });
}

test("how-it-works lists the real roster and pick clock options", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText("QB, RB, RB, WR, WR, TE, FLEX (RB/WR/TE), K, DST")).toBeVisible();
  await expect(page.getByText(/2, 4, 8 or 24 hours/)).toBeVisible();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test e2e/marketing-pages.spec.ts`
Expected: FAIL with a 404 on both pages.

- [ ] **Step 3: Implement**

```tsx
// src/components/marketing/closing-cta.tsx
import { getLaunchPhase } from "@/lib/launch";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import type { SubscribeSource } from "@/domain/subscribers/sources";
import { CtaLink } from "./cta-link";
import { Section } from "./section";
import { SignupForm } from "./signup-form";

/** The end-of-page call to action, following the same launch phase as the home hero. */
export function ClosingCta({ page, source }: { page: string; source: SubscribeSource }) {
  const phase = getLaunchPhase();
  return (
    <Section className="pb-20">
      <div className="card flex flex-col gap-4 p-8">
        {phase === "list" ? (
          <>
            <h2 className="text-2xl font-semibold">Leagues open in December</h2>
            <p className="text-ink-soft">Get the weekly playoff race in your inbox, and a heads-up the day you can start a league.</p>
            <SignupForm source={source} />
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">Start your league</h2>
            <p className="text-ink-soft">
              Drafts open {formatCalendarDay(SEASON_CALENDAR.fieldSet)} and must finish before Wild Card kickoff on{" "}
              {formatCalendarDay(SEASON_CALENDAR.wildCardStart)}.
            </p>
            <div>
              <CtaLink href="/leagues/new" cta="start_league" page={page} phase={phase}>
                Start your league
              </CtaLink>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
```

```tsx
// src/app/(marketing)/how-it-works/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_ROSTER_SLOTS, FREE_TIER_MAX_ENTRIES, pickClockHoursSchema } from "@/domain/league-settings";
import { FLEX_ELIGIBLE } from "@/domain/draft/slot-assignment";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import { Section } from "@/components/marketing/section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How NFL playoff best ball works: a slow snake draft before Wild Card weekend, nine players who score every round their team is alive, and no lineups to set.",
  alternates: { canonical: "/how-it-works" },
};

// Derived from the engine, so the copy can't drift from the rules.
const ROSTER = DEFAULT_ROSTER_SLOTS.map((s) => (s.slot === "FLEX" ? `FLEX (${FLEX_ELIGIBLE.join("/")})` : s.slot)).join(", ");
const CLOCKS = pickClockHoursSchema.options.map((o) => o.value);
const CLOCK_TEXT = `${CLOCKS.slice(0, -1).join(", ")} or ${CLOCKS.at(-1)} hours`;

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Set up the league",
    body: (
      <>
        A commissioner creates the league, chooses the scoring and the pick clock, and shares one invite link. Up to{" "}
        {FREE_TIER_MAX_ENTRIES} teams play free; Premium leagues hold up to {PREMIUM_MAX_ENTRIES} and allow more than one
        team per person.
      </>
    ),
  },
  {
    title: "The draft",
    body: (
      <>
        A snake draft, nine rounds, and every NFL player can be drafted once per league. Each pick has a clock of{" "}
        {CLOCK_TEXT}, set by the commissioner, and it can pause overnight from 1 to 8 a.m. Eastern. You&apos;re
        notified by email when you&apos;re on the clock, and by text or push if you turn those on. If time runs out,
        autodraft takes your top queued player that fits, or the best available. Drafts run between{" "}
        {formatCalendarDay(SEASON_CALENDAR.fieldSet)}, when the playoff field is set, and Wild Card kickoff on{" "}
        {formatCalendarDay(SEASON_CALENDAR.wildCardStart)}.
      </>
    ),
  },
  {
    title: "Your roster",
    body: (
      <>
        Nine slots: <span className="font-mono text-ink">{ROSTER}</span>. Every pick fills one, so plan your positions;
        there&apos;s no bench to hide a mistake.
      </>
    ),
  },
  {
    title: "Scoring",
    body: (
      <>
        Points come from real NFL box scores, using standard, half-PPR or full-PPR scoring (Premium leagues can set
        every value). All nine of your players score every round their team plays.{" "}
        <Link href="/scoring" className="font-semibold text-brand underline-offset-4 hover:underline">
          See the scoring tables
        </Link>
        .
      </>
    ),
  },
  {
    title: "Eliminations and byes",
    body: "Lose and you're out: a player stops scoring when his team is eliminated. The top seed in each conference skips Wild Card weekend, so its players can play three games at most instead of four. Balancing bye teams against teams that have to win four times is the strategy.",
  },
  {
    title: "Injuries",
    body: "Commissioners can turn on substitutions (off by default). An injured player's points up to the injury count, plus his substitute's points afterward.",
  },
  {
    title: "Following along",
    body: "Scores update live during games, the leaderboard moves with every touchdown, and everyone gets a preview before each round and a recap after it.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section className="pt-16">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How playoff best ball works</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Draft nine players before Wild Card weekend. They score every round their team survives. Most points after the
          Super Bowl wins.
        </p>
      </Section>
      <Section>
        <div className="flex max-w-3xl flex-col gap-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-2xl font-semibold">{s.title}</h2>
              <p className="mt-3 text-lg text-ink-soft">{s.body}</p>
            </section>
          ))}
        </div>
      </Section>
      <ClosingCta page="how_it_works" source="how_it_works" />
    </>
  );
}
```

```tsx
// src/app/(marketing)/commissioners/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import { Section } from "@/components/marketing/section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "Commissioners",
  description:
    "Run an NFL playoff best ball league in minutes: one invite link, a slow draft that runs itself, dues tracking, and free for up to 10 teams.",
  alternates: { canonical: "/commissioners" },
};

export default function CommissionersPage() {
  const fieldSet = formatCalendarDay(SEASON_CALENDAR.fieldSet);
  const wildCard = formatCalendarDay(SEASON_CALENDAR.wildCardStart);
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);

  const items: { title: string; body: React.ReactNode }[] = [
    {
      title: "Set up in a couple of minutes",
      body: "Name the league, pick a scoring preset and a pick clock, and decide whether the clock pauses overnight. Add an entry fee and your Venmo handle if your group plays for money.",
    },
    {
      title: "One link brings everyone in",
      body: "Share the invite link in your group chat. Members sign in with Google, Apple or an emailed link, and joining is always free.",
    },
    {
      title: "Plan the draft window",
      body: `The playoff field is set on ${fieldSet}, and the draft has to finish before Wild Card kickoff on ${wildCard}. Schedule the start time, and pick a clock that fits: with ten teams there are 90 picks to make, so shorter clocks finish sooner.`,
    },
    {
      title: "The draft runs itself",
      body: "Everyone is notified when they're on the clock, and autodraft covers anyone who misses a turn. You never have to chase people down in the group chat.",
    },
    {
      title: "Track who's paid",
      body: "Mark each team paid on the league page and show members where to send the money. The money itself never touches Playoff Best Ball.",
    },
    {
      title: "Free, or Premium for bigger leagues",
      body: (
        <>
          Free leagues hold up to {FREE_TIER_MAX_ENTRIES} teams with preset scoring, one free league per commissioner each season.
          Premium is {price} per league, per season: up to {PREMIUM_MAX_ENTRIES} teams, custom scoring, more than one team
          per person, and projections.{" "}
          <Link href="/pricing" className="font-semibold text-brand underline-offset-4 hover:underline">
            Pricing
          </Link>
        </>
      ),
    },
  ];

  return (
    <>
      <Section className="pt-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">For commissioners</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Run the league, skip the spreadsheet</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          No more drafting over text across three days. Set the league up once and the app handles the draft, the scoring and
          the standings.
        </p>
      </Section>
      <Section>
        <ul className="grid gap-6 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.title} className="card p-6">
              <h2 className="text-xl font-semibold">{i.title}</h2>
              <p className="mt-2 text-ink-soft">{i.body}</p>
            </li>
          ))}
        </ul>
      </Section>
      <ClosingCta page="commissioners" source="commissioners" />
    </>
  );
}
```

`pickClockHoursSchema` is a `z.union` of `z.literal`s. If `.options.map((o) => o.value)` doesn't typecheck under zod 4, read the values with `.options.map((o) => o.def.values[0])`, or export a `PICK_CLOCK_HOURS = [2, 4, 8, 24] as const` from `league-settings.ts` and build the schema from it. Use whichever keeps one source of truth. Don't hardcode the list on the page.

- [ ] **Step 4: Run the e2e test, typecheck and lint**

Run: `npm run typecheck && npm run lint && npx playwright test e2e/marketing-pages.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/how-it-works" "src/app/(marketing)/commissioners" src/components/marketing/closing-cta.tsx e2e/marketing-pages.spec.ts
git commit -m "feat: how-it-works and commissioners pages, copy derived from the rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B6: `/scoring`, generated from the engine

**Files:**
- Create: `src/domain/scoring-reference.ts`, `src/app/(marketing)/scoring/page.tsx`
- Test: `src/domain/scoring-reference.test.ts`; extend `e2e/marketing-pages.spec.ts`

**Interfaces:**
- Consumes: `SCORING_PRESETS`, `scoringSettingsSchema`, `DEFAULT_ROSTER_SLOTS`, `FLEX_ELIGIBLE`.
- Produces:
  - `scoringReference(): ScoringGroup[]`, where:
    - `ScoringGroup = { title: string; rows: ScoringRow[] }`
    - `ScoringRow = { key: keyof ScoringSettings; label: string; standard: string; halfPpr: string; fullPpr: string }`
  - `EXCLUDED_SCORING_KEYS`
  - `rosterReference(): string[]`

- [ ] **Step 1: Write the failing unit test**

```ts
// src/domain/scoring-reference.test.ts
import { describe, it, expect } from "vitest";
import { scoringSettingsSchema } from "./league-settings";
import { EXCLUDED_SCORING_KEYS, rosterReference, scoringReference } from "./scoring-reference";

describe("scoringReference", () => {
  const rows = scoringReference().flatMap((g) => g.rows);

  it("accounts for every scoring setting: shown, or excluded on purpose", () => {
    const shown = rows.map((r) => r.key);
    expect([...shown, ...EXCLUDED_SCORING_KEYS].sort()).toEqual(Object.keys(scoringSettingsSchema.shape).sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("reads each preset's own values", () => {
    const reception = rows.find((r) => r.key === "ppr")!;
    expect([reception.standard, reception.halfPpr, reception.fullPpr]).toEqual(["0", "+0.5", "+1"]);
    const passTd = rows.find((r) => r.key === "passTd")!;
    expect(passTd.standard).toBe("+6");
    const passYards = rows.find((r) => r.key === "passYardsPerPoint")!;
    expect(passYards.standard).toBe("1 per 30 yds");
  });

  it("lists the default roster with FLEX eligibility", () => {
    expect(rosterReference()).toEqual(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX (RB/WR/TE)", "K", "DST"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/scoring-reference.test.ts`
Expected: FAIL. Cannot find module `./scoring-reference`.

- [ ] **Step 3: Implement the module**

```ts
// src/domain/scoring-reference.ts
import { DEFAULT_ROSTER_SLOTS, SCORING_PRESETS, type ScoringSettings } from "./league-settings";
import { FLEX_ELIGIBLE } from "./draft/slot-assignment";

export interface ScoringRow {
  key: keyof ScoringSettings;
  label: string;
  standard: string;
  halfPpr: string;
  fullPpr: string;
}
export interface ScoringGroup {
  title: string;
  rows: ScoringRow[];
}

/**
 * Settings deliberately not shown. Blocked kicks are in the presets, but the stats
 * feed never populates them (src/lib/stats/espn-parse.ts), so listing "+2" would
 * promise points that can't happen.
 */
export const EXCLUDED_SCORING_KEYS: (keyof ScoringSettings)[] = ["block"];

const points = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const perYards = (n: number) => `1 per ${n} yds`;

function row(key: keyof ScoringSettings, label: string, format: (n: number) => string = points): ScoringRow {
  return {
    key,
    label,
    standard: format(SCORING_PRESETS.standard[key]),
    halfPpr: format(SCORING_PRESETS.half_ppr[key]),
    fullPpr: format(SCORING_PRESETS.full_ppr[key]),
  };
}

/** The scoring page's tables, read from the same presets the engine scores with. */
export function scoringReference(): ScoringGroup[] {
  return [
    {
      title: "Passing",
      rows: [row("passYardsPerPoint", "Passing yards", perYards), row("passTd", "Passing TD"), row("passInt", "Interception thrown")],
    },
    {
      title: "Rushing and receiving",
      rows: [
        row("rushYardsPerPoint", "Rushing yards", perYards),
        row("rushTd", "Rushing TD"),
        row("recYardsPerPoint", "Receiving yards", perYards),
        row("recTd", "Receiving TD"),
        row("ppr", "Reception"),
        row("twoPtConv", "2-point conversion"),
        row("fumbleLost", "Fumble lost"),
        row("returnTd", "Kick or punt return TD"),
      ],
    },
    {
      title: "Kicking",
      rows: [
        row("fg0_19", "Field goal, 0–19 yds"),
        row("fg20_29", "Field goal, 20–29 yds"),
        row("fg30_39", "Field goal, 30–39 yds"),
        row("fg40_49", "Field goal, 40–49 yds"),
        row("fg50Plus", "Field goal, 50+ yds"),
        row("fgMiss", "Missed field goal"),
        row("xpMade", "Extra point"),
        row("xpMiss", "Missed extra point"),
      ],
    },
    {
      title: "Defense / special teams",
      rows: [
        row("sack", "Sack"),
        row("defInt", "Interception"),
        row("fumRec", "Fumble recovery"),
        row("dstTd", "Defensive or return TD"),
        row("safety", "Safety"),
        row("pa0", "0 points allowed"),
        row("pa1_6", "1–6 points allowed"),
        row("pa7_13", "7–13 points allowed"),
        row("pa14_20", "14–20 points allowed"),
        row("pa21_27", "21–27 points allowed"),
        row("pa28_34", "28–34 points allowed"),
        row("pa35Plus", "35+ points allowed"),
      ],
    },
  ];
}

export function rosterReference(): string[] {
  return DEFAULT_ROSTER_SLOTS.map((s) => (s.slot === "FLEX" ? `FLEX (${FLEX_ELIGIBLE.join("/")})` : s.slot));
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/scoring-reference.test.ts`
Expected: 3 passed. If "1 per 30 yds" fails, the preset value differs; the test's expectation must then read the preset (`perYards(SCORING_PRESETS.standard.passYardsPerPoint)`), never be hand-edited to a guess.

- [ ] **Step 5: Build the page and extend the e2e test**

```tsx
// src/app/(marketing)/scoring/page.tsx
import type { Metadata } from "next";
import { rosterReference, scoringReference } from "@/domain/scoring-reference";
import { Section } from "@/components/marketing/section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "Scoring",
  description: "Playoff best ball scoring rules: standard, half-PPR and full-PPR point values, and the nine-slot roster.",
  alternates: { canonical: "/scoring" },
};

export default function ScoringPage() {
  return (
    <>
      <Section className="pt-16">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Scoring</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Every league picks one of three presets. Premium leagues can change any value. These tables are read straight from the
          scoring engine.
        </p>
      </Section>
      <Section title="Roster">
        <ul className="flex flex-wrap gap-2">
          {rosterReference().map((slot, i) => (
            <li key={`${slot}-${i}`} className="rounded-md bg-brand-tint px-3 py-1 font-mono text-sm font-semibold text-ink">
              {slot}
            </li>
          ))}
        </ul>
      </Section>
      {scoringReference().map((group) => (
        <Section key={group.title} title={group.title}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule text-sm text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">Stat</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Standard</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Half PPR</th>
                  <th scope="col" className="py-2 font-semibold">Full PPR</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.key} className="border-b border-rule">
                    <th scope="row" className="py-2 pr-4 font-normal text-ink">{r.label}</th>
                    <td className="py-2 pr-4 font-mono text-ink-soft">{r.standard}</td>
                    <td className="py-2 pr-4 font-mono text-ink-soft">{r.halfPpr}</td>
                    <td className="py-2 font-mono text-ink-soft">{r.fullPpr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <ClosingCta page="scoring" source="scoring" />
    </>
  );
}
```

Add `{ path: "/scoring", h1: /^scoring$/i, title: /Scoring · Playoff Best Ball/ }` to `PAGES` in `e2e/marketing-pages.spec.ts`, and append:

```ts
test("scoring shows the preset values from the engine", async ({ page }) => {
  await page.goto("/scoring");
  const reception = page.getByRole("row", { name: /^Reception/ });
  await expect(reception).toContainText("+0.5");
  await expect(reception).toContainText("+1");
});
```

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx playwright test e2e/marketing-pages.spec.ts`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/domain/scoring-reference.ts src/domain/scoring-reference.test.ts "src/app/(marketing)/scoring" e2e/marketing-pages.spec.ts
git commit -m "feat: scoring page generated from the engine's presets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B7: `/pricing` (ported) and `/faq`

**Files:**
- Create: `src/app/(marketing)/pricing/page.tsx`, `src/app/(marketing)/faq/page.tsx`
- Delete: `src/app/pricing/page.tsx`
- Test: extend `e2e/marketing-pages.spec.ts`; run the existing `e2e/monetization.spec.ts`

**Interfaces:**
- Consumes: B4 `faqItems`, `FaqList`; pricing constants.

- [ ] **Step 1: Check whether existing specs depend on the old pricing page**

Run: `grep -n "pricing" e2e/*.ts`. Note every assertion. The port must keep its link and button names: "Create a league" or "Get started", and the "Pricing" heading. Alternatively, update those specs in Step 4 with a stated reason.

- [ ] **Step 2: Extend the e2e test (failing)**

Add to `PAGES`:

```ts
  { path: "/pricing", h1: /^pricing$/i, title: /Pricing · Playoff Best Ball/ },
  { path: "/faq", h1: /questions/i, title: /FAQ · Playoff Best Ball/ },
```

and append:

```ts
test("faq answers quote the real dates and price", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByText(/Sun, Jan 10/).first()).toBeVisible();
  await expect(page.getByText(/\$25 per league, per season/)).toBeVisible();
});
```

Run: `npx playwright test e2e/marketing-pages.spec.ts`
Expected: FAIL. `/faq` returns 404, and the old `/pricing` has no "Pricing · Playoff Best Ball" title.

- [ ] **Step 3: Implement**

```tsx
// src/app/(marketing)/pricing/page.tsx
import type { Metadata } from "next";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { Section } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq-list";
import { faqItems } from "@/components/marketing/faq-content";
import { CtaLink } from "@/components/marketing/cta-link";
import { getLaunchPhase } from "@/lib/launch";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Play free with standard, half-PPR or full-PPR scoring, or upgrade a league to Premium for custom scoring, more teams, multiple entries and projections.",
  alternates: { canonical: "/pricing" },
};

/**
 * Every line here is enforced somewhere in the domain layer. The caps come from the
 * same constants the rules use, so the page cannot drift from the product. Do not
 * add a benefit that isn't gated in code.
 */
const FREE = [
  `Up to ${FREE_TIER_MAX_ENTRIES} teams per league`,
  "Standard, half PPR and full PPR scoring",
  "Async slow-snake draft with pick clocks",
  "Email, SMS and push notifications",
  "Best ball scoring all the way to the Super Bowl",
];

const PREMIUM = [
  `Up to ${PREMIUM_MAX_ENTRIES} teams per league`,
  "Custom scoring — set the value of every stat",
  "Multiple entries per person",
  "Next-week projections from recent scoring and Vegas win probability",
  "No ads",
];

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 h-5 w-5 shrink-0 text-brand" fill="none">
      <path d="M4 12.5 L9.5 18 L20 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingPage() {
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);
  const phase = getLaunchPhase();
  return (
    <>
      <Section className="pt-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pricing</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Playing is free. Premium is bought per league, per season, by whoever runs it. Once it&apos;s on, everyone in that
          league gets it.
        </p>
      </Section>
      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="card flex flex-col gap-4 p-8">
            <h2 className="text-2xl font-semibold">Free</h2>
            <p className="text-ink-soft">Everything you need to run a league.</p>
            <p className="font-mono text-4xl font-semibold">$0</p>
            <ul className="flex flex-col gap-2">
              {FREE.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2">
              <CtaLink href="/leagues/new" cta="create_league" page="pricing" phase={phase} className="btn">
                Create a league
              </CtaLink>
            </div>
          </section>
          <section className="card flex flex-col gap-4 border-brand p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Premium</h2>
              <span className="badge text-brand">PER LEAGUE</span>
            </div>
            <p className="text-ink-soft">Everything in Free, plus:</p>
            <p>
              <span className="font-mono text-4xl font-semibold">{price}</span>{" "}
              <span className="text-ink-muted">per season</span>
            </p>
            <ul className="flex flex-col gap-2">
              {PREMIUM.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-2 text-sm text-ink-muted">
              Upgrade from your league page. The commissioner pays once and the whole league is in.
            </p>
          </section>
        </div>
      </Section>
      <Section title="Questions">
        <FaqList items={faqItems().filter((f) => f.category === "pricing")} />
      </Section>
    </>
  );
}
```

```tsx
// src/app/(marketing)/faq/page.tsx
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq-list";
import { faqItems } from "@/components/marketing/faq-content";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about NFL playoff best ball: the draft window, eliminations and byes, injuries, pricing and buy-ins.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const items = faqItems();
  return (
    <>
      <Section className="pt-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Questions</h1>
      </Section>
      <Section title="Playing">
        <FaqList items={items.filter((f) => f.category === "general")} />
      </Section>
      <Section title="Pricing">
        <FaqList items={items.filter((f) => f.category === "pricing")} />
      </Section>
      <ClosingCta page="faq" source="faq" />
    </>
  );
}
```

Delete `src/app/pricing/page.tsx`. Two `page.tsx` files for `/pricing` would be a build error.

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npx playwright test e2e/marketing-pages.spec.ts e2e/monetization.spec.ts`
Expected: all pass. If `monetization.spec.ts` asserted the old signed-in pricing nav (AppNav on `/pricing`), update that assertion. The page is static now and intentionally the same for everyone (spec §4.1). Note this in the commit body.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/pricing" "src/app/(marketing)/faq" e2e/marketing-pages.spec.ts
git rm src/app/pricing/page.tsx
git commit -m "feat: pricing ported to cobalt and the marketing group; FAQ page

Pricing is now static and identical for signed-in and signed-out visitors.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B8: Email-flow pages and the end-to-end list flow

**Files:**
- Create: `src/app/(marketing)/subscribe/confirm/page.tsx`, `src/app/(marketing)/subscribe/confirmed/page.tsx`, `src/app/(marketing)/unsubscribe/page.tsx`
- Test: `e2e/subscribe-flow.spec.ts`

**Interfaces:**
- Consumes: the A7 routes; A4 `requestSubscription` and `test-support` (e2e test only); B4 `SignupForm`.

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/subscribe-flow.spec.ts
import { test, expect } from "@playwright/test";
import { testDb } from "../tests/helpers/db";
import { requestSubscription } from "../src/domain/subscribers/subscribe";
import type { MarketingEmail } from "../src/domain/subscribers/sender";
import { subscriberUrls } from "../src/lib/site-url";
import { uniqueEmail, signUp } from "./helpers/auth";

/** A pending subscription created through the real domain code, with its emailed links captured. */
async function pendingSubscription(baseURL: string) {
  const email = uniqueEmail("flow");
  const sent: MarketingEmail[] = [];
  await requestSubscription(testDb, { send: async (m) => void sent.push(m) }, subscriberUrls(baseURL), {
    email,
    source: "footer",
    now: new Date(),
  });
  const confirmUrl = sent[0].text.match(/Confirm: (\S+)/)![1];
  const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email } });
  return { email, confirmUrl, row };
}

test("confirm, unsubscribe and resubscribe through the real pages", async ({ page, baseURL }) => {
  const { confirmUrl, row } = await pendingSubscription(baseURL!);

  await page.goto(confirmUrl);
  await page.getByRole("button", { name: /confirm my email/i }).click();
  await expect(page).toHaveURL(/\/subscribe\/confirmed$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/you're on the list/i);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");

  // A re-click of the same email link is harmless.
  await page.goto(confirmUrl);
  await page.getByRole("button", { name: /confirm my email/i }).click();
  await expect(page).toHaveURL(/\/subscribe\/confirmed$/);

  await page.goto(`/unsubscribe?token=${row.unsubscribeToken}`);
  await page.getByRole("button", { name: /^unsubscribe$/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/you're unsubscribed/i);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UNSUBSCRIBED");

  await page.getByRole("button", { name: /resubscribe/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/you're back on the list/i);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");
});

test("a truncated confirm link shows a friendly page with a way to sign up again", async ({ page }) => {
  await page.goto("/subscribe/confirm?token=abc123");
  await page.getByRole("button", { name: /confirm my email/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/isn't valid/i);
  await expect(page.getByRole("main").getByLabel(/email address/i)).toBeVisible();
});

test("one-click unsubscribe works without a page", async ({ page, baseURL }) => {
  const { row } = await pendingSubscription(baseURL!);
  const res = await page.request.post(`/api/unsubscribe?token=${row.unsubscribeToken}`, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(res.status()).toBe(200);
});

test("a signed-in visitor using the header's Sign in lands on the dashboard", async ({ page }) => {
  await signUp(page, "Header", uniqueEmail("header"));
  await page.goto("/faq");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test e2e/subscribe-flow.spec.ts`
Expected: FAIL. `/subscribe/confirm` returns 404.

- [ ] **Step 3: Implement the pages**

```tsx
// src/app/(marketing)/subscribe/confirm/page.tsx
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { SignupForm } from "@/components/marketing/signup-form";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

/**
 * A button instead of confirming on page load: email security scanners open every
 * link, and would otherwise confirm signups nobody asked for (spec §5.3).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;

  if (status === "expired" || status === "invalid" || !token) {
    const expired = status === "expired";
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">{expired ? "That link has expired" : "That link isn't valid"}</h1>
        <p className="mt-3 text-ink-soft">
          {expired
            ? "Confirmation links work for 7 days. Sign up again and we'll send a fresh one."
            : "If you already confirmed, you're on the list. Otherwise, sign up again and we'll send a fresh link."}
        </p>
        <div className="mt-6">
          <SignupForm source="subscribe_page" />
        </div>
      </Section>
    );
  }

  return (
    <Section className="max-w-2xl pt-16">
      <h1 className="text-3xl font-semibold">One more step</h1>
      <p className="mt-3 text-ink-soft">Confirm you want the weekly playoff-race digest and a heads-up when leagues open.</p>
      <form method="post" action="/api/subscribe/confirm" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Confirm my email
        </button>
      </form>
    </Section>
  );
}
```

```tsx
// src/app/(marketing)/subscribe/confirmed/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "You're on the list", robots: { index: false } };

export default function ConfirmedPage() {
  return (
    <Section className="max-w-2xl pt-16">
      <h1 className="text-3xl font-semibold">You&apos;re on the list</h1>
      <p className="mt-3 text-ink-soft">
        Expect one email a week through the regular season, and a heads-up the day leagues open. Every email has a one-click
        unsubscribe.
      </p>
      <p className="mt-6">
        <Link href="/how-it-works" className="btn">
          How it works
        </Link>
      </p>
    </Section>
  );
}
```

```tsx
// src/app/(marketing)/unsubscribe/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** Button-driven for the same link-scanner reason as /subscribe/confirm. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;

  if (status === "invalid" || !token) {
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">We don&apos;t recognize that link</h1>
        <p className="mt-3 text-ink-soft">
          Try the unsubscribe link from your most recent email. If you have an account, you can also turn the digest off in{" "}
          <Link href="/settings/notifications" className="font-semibold text-brand underline-offset-4 hover:underline">
            notification settings
          </Link>
          .
        </p>
      </Section>
    );
  }

  if (status === "unsubscribed") {
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">You&apos;re unsubscribed</h1>
        <p className="mt-3 text-ink-soft">You won&apos;t get the weekly digest anymore. Clicked by mistake?</p>
        <form method="post" action="/api/unsubscribe/undo" className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="btn">
            Resubscribe
          </button>
        </form>
      </Section>
    );
  }

  if (status === "resubscribed") {
    return (
      <Section className="max-w-2xl pt-16">
        <h1 className="text-3xl font-semibold">You&apos;re back on the list</h1>
        <p className="mt-3 text-ink-soft">The weekly digest will keep coming.</p>
      </Section>
    );
  }

  return (
    <Section className="max-w-2xl pt-16">
      <h1 className="text-3xl font-semibold">Unsubscribe from the weekly digest?</h1>
      <form method="post" action="/api/unsubscribe" className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary">
          Unsubscribe
        </button>
      </form>
    </Section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npm run lint && npx playwright test e2e/subscribe-flow.spec.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/subscribe" "src/app/(marketing)/unsubscribe" e2e/subscribe-flow.spec.ts
git commit -m "feat: confirm and unsubscribe pages — button-driven so link scanners can't act

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task B9: Static-rendering guard, full verification, PR 2

**Files:**
- Create: `scripts/check-static-routes.mjs`
- Modify: `package.json`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write the guard**

```js
#!/usr/bin/env node
/**
 * Fails when a marketing page stops prerendering. A session read creeping back into
 * the root layout (or any page in the group) silently turns these into per-request
 * renders. That's slower for every visitor, and nothing else would notice.
 *
 * Run after `next build`: node scripts/check-static-routes.mjs
 */
import { readFileSync } from "node:fs";

const STATIC_ROUTES = ["/", "/how-it-works", "/scoring", "/commissioners", "/pricing", "/faq", "/subscribe/confirmed"];

const manifest = JSON.parse(readFileSync(new URL("../.next/prerender-manifest.json", import.meta.url), "utf8"));
const missing = STATIC_ROUTES.filter((route) => !(route in manifest.routes));

if (missing.length) {
  console.error(`Not prerendered: ${missing.join(", ")}`);
  console.error("Something in their render path reads cookies, headers or the session.");
  process.exit(1);
}
console.log(`All ${STATIC_ROUTES.length} marketing routes prerendered.`);
```

- [ ] **Step 2: Prove it catches a regression, then that it passes**

```bash
BETTER_AUTH_SECRET=ci-secret-0123456789abcdef0123456789abcdef npm run build
node scripts/check-static-routes.mjs
```
Expected: "All 7 marketing routes prerendered."

Then temporarily add `const _ = await (await import("next/headers")).cookies();` inside `HowItWorksPage` (making it `async`), rebuild and rerun. Expected: "Not prerendered: /how-it-works" and exit 1. Revert the temporary change and rebuild.

- [ ] **Step 3: Wire it in**

In `package.json` `scripts`, add `"check:static": "node scripts/check-static-routes.mjs",`. In `.github/workflows/ci.yml`, after the `npm run build` step (and its `env:` block), add:

```yaml
      - run: npm run check:static
```

- [ ] **Step 4: Run the full CI mirror**

Run the "Full CI mirror" from Execution Environment, plus `npm run check:contrast && npm run check:static`.
Expected: all green. Report the counts.

- [ ] **Step 5: Commit, push, open PR 2**

```bash
git add scripts/check-static-routes.mjs package.json .github/workflows/ci.yml
git commit -m "ci: fail when a marketing page stops prerendering

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/marketing-pages
gh pr create --base feat/marketing-foundation --title "feat: cobalt marketing pages (piece 1, PR 2 of 3)" --body "$(cat <<'EOF'
Stacked on PR 1. Spec §3–§4, plan Phase B.

- Public pages in cobalt's light theme: home (list-first CTA that flips at `SIGNUPS_OPEN_AT`), how it works, scoring (generated from the engine's presets), commissioners, pricing (ported), FAQ, and the confirm/unsubscribe pages.
- The root layout no longer reads the session, so the marketing pages prerender; `src/proxy.ts` redirects signed-in visitors from `/`. CI now fails if a marketing page stops prerendering.
- `--bad` error token, `.theme-light` scope, and #42's contrast gate wired into CI with the pairs these pages use.

Copy is written once from the rules and checked against the code. Please review it on the preview deployment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Phase C — Search, share images, invite previews (branch `feat/marketing-seo-invite`, from Phase B's tip)

### Task C1: `robots.txt` and `sitemap.xml`

**Files:**
- Create: `src/lib/indexing.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`
- Test: `src/lib/indexing.test.ts`

**Interfaces:**
- Consumes: A3 `CANONICAL_ORIGIN`; `DEMO_MODE_REQUESTED`.
- Produces:
  - `isIndexable(env: { VERCEL_ENV?: string; demoMode: boolean }): boolean`
  - `robotsRules(env): MetadataRoute.Robots`
  - `sitemapEntries(): MetadataRoute.Sitemap`
  - `PUBLIC_ROUTES`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/indexing.test.ts
import { describe, it, expect } from "vitest";
import { isIndexable, PUBLIC_ROUTES, robotsRules, sitemapEntries } from "./indexing";

describe("indexing policy", () => {
  it("indexes only the real production deployment", () => {
    expect(isIndexable({ VERCEL_ENV: "production", demoMode: false })).toBe(true);
    expect(isIndexable({ VERCEL_ENV: "production", demoMode: true })).toBe(false); // the demo project
    expect(isIndexable({ VERCEL_ENV: "preview", demoMode: false })).toBe(false);
    expect(isIndexable({ demoMode: false })).toBe(false); // local
  });

  it("production robots allow marketing, block the app, keep /join crawlable for link previews, and point at the sitemap", () => {
    const robots = robotsRules({ VERCEL_ENV: "production", demoMode: false });
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/dashboard", "/leagues/", "/admin", "/settings/", "/mock-draft"]));
    expect(rule.disallow).not.toContain("/join/");
    expect(robots.sitemap).toBe("https://playoffbestball.com/sitemap.xml");
  });

  it("everything else blocks all crawling", () => {
    for (const env of [{ VERCEL_ENV: "preview", demoMode: false }, { VERCEL_ENV: "production", demoMode: true }, { demoMode: false }]) {
      const robots = robotsRules(env);
      const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
      expect(rule.disallow).toBe("/");
      expect(robots.sitemap).toBeUndefined();
    }
  });

  it("the sitemap lists exactly the public marketing routes at the canonical origin", () => {
    expect(sitemapEntries().map((e) => e.url)).toEqual(PUBLIC_ROUTES.map((r) => `https://playoffbestball.com${r === "/" ? "" : r}`));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run src/lib/indexing.test.ts`
Expected: FAIL. Cannot find module `./indexing`.

- [ ] **Step 3: Implement**

```ts
// src/lib/indexing.ts
import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "./site-url";

/** Marketing pages worth indexing. Piece 3 appends the rankings and race pages. */
export const PUBLIC_ROUTES = ["/", "/how-it-works", "/scoring", "/commissioners", "/pricing", "/faq"] as const;

/**
 * Signed-in app areas. /join/ is deliberately absent: invite pages carry a noindex
 * meta tag instead, because link-preview bots that obey robots.txt (Twitterbot)
 * would otherwise never fetch the invite card, and Google can only honor noindex on
 * pages it may crawl (plan: spec clarification 2).
 */
const DISALLOW = ["/api/", "/dashboard", "/leagues/", "/admin", "/settings/", "/mock-draft", "/sign-in"];

export interface IndexingEnv {
  VERCEL_ENV?: string;
  demoMode: boolean;
}

/** Only the real production deployment is indexable. Previews, the demo project and local are not (spec §6). */
export function isIndexable(env: IndexingEnv): boolean {
  return env.VERCEL_ENV === "production" && !env.demoMode;
}

export function robotsRules(env: IndexingEnv): MetadataRoute.Robots {
  if (!isIndexable(env)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOW },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
  };
}

export function sitemapEntries(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({ url: `${CANONICAL_ORIGIN}${route === "/" ? "" : route}` }));
}
```

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/indexing";
import { DEMO_MODE_REQUESTED } from "@/lib/demo-mode";

export default function robots(): MetadataRoute.Robots {
  return robotsRules({ VERCEL_ENV: process.env.VERCEL_ENV, demoMode: DEMO_MODE_REQUESTED });
}
```

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/indexing";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
```

- [ ] **Step 4: Run the test, then check the real output**

Run: `npx dotenv -e .env.test -- npx vitest run src/lib/indexing.test.ts`
Expected: 4 passed.

Then run `npm run dev` and `curl -s localhost:3000/robots.txt`. Expected: `Disallow: /`, because local is not indexable.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indexing.ts src/lib/indexing.test.ts src/app/robots.ts src/app/sitemap.ts
git commit -m "feat: robots and sitemap — only real production is indexable

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task C2: Share images for marketing pages

**Files:**
- Create: `src/lib/og.tsx`, and `opengraph-image.tsx` in `src/app/(marketing)/`, `how-it-works/`, `scoring/`, `commissioners/`, `pricing/`, `faq/`
- Test: `e2e/share-images.spec.ts`

**Interfaces:**
- Produces:
  - `OG_SIZE = { width: 1200, height: 630 }`
  - `renderOgImage(input: { eyebrow: string; title: string; footer?: string }): ImageResponse`

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/share-images.spec.ts
import { test, expect } from "@playwright/test";

for (const path of ["/", "/how-it-works", "/scoring", "/commissioners", "/pricing", "/faq"]) {
  test(`${path} has a large share card that renders as a PNG`, async ({ page }) => {
    await page.goto(path);
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toBeTruthy();
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    // og:image is absolute against metadataBase (production); fetch the same path from this server.
    const res = await page.request.get(new URL(og!).pathname + new URL(og!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test e2e/share-images.spec.ts`
Expected: FAIL. There is no `og:image` meta tag.

- [ ] **Step 3: Implement**

```tsx
// src/lib/og.tsx
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * One share-card template, in cobalt. Mostly seen as group-chat previews, so the
 * title has to read at thumbnail size. Inline styles only: ImageResponse supports a
 * flexbox subset of CSS and no class names.
 */
export function renderOgImage({ eyebrow, title, footer = "playoffbestball.com" }: { eyebrow: string; title: string; footer?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f7f8fa",
          color: "#14161c",
          borderTop: "16px solid #1b4fe8",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "#1b4fe8", textTransform: "uppercase", letterSpacing: 2 }}>
          {eyebrow}
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#3c424e" }}>
          <span>Playoff Best Ball</span>
          <span>{footer}</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
```

Create each marketing route's image. Every file has the same shape. The literal text for each is listed after the example; write the full file for each route, not a reference to this one.

```tsx
// src/app/(marketing)/opengraph-image.tsx
import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Playoff Best Ball: draft once, watch all playoffs";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "NFL playoff best ball", title: "Draft once. Watch all playoffs." });
}
```

| File | `alt` | `eyebrow` | `title` |
|---|---|---|---|
| `(marketing)/how-it-works/opengraph-image.tsx` | "How playoff best ball works" | "How it works" | "Nine players. Four rounds. Nothing to manage." |
| `(marketing)/scoring/opengraph-image.tsx` | "Playoff best ball scoring" | "Scoring" | "Standard, half PPR or full PPR." |
| `(marketing)/commissioners/opengraph-image.tsx` | "Run a playoff best ball league" | "For commissioners" | "Run the league. Skip the spreadsheet." |
| `(marketing)/pricing/opengraph-image.tsx` | "Playoff Best Ball pricing" | "Pricing" | "Free to play. Premium per league." |
| `(marketing)/faq/opengraph-image.tsx` | "Playoff best ball questions" | "FAQ" | "The draft, byes, injuries and buy-ins." |

- [ ] **Step 4: Run the tests and the static guard**

Run: `npm run typecheck && npx playwright test e2e/share-images.spec.ts && BETTER_AUTH_SECRET=ci-secret-0123456789abcdef0123456789abcdef npm run build && npm run check:static`
Expected: 6 passed; the build lists the `opengraph-image` routes as static; the guard is still green.

Open `localhost:3000/opengraph-image` in a browser. The card should look right: readable at a glance, and nothing clipped.

- [ ] **Step 5: Commit**

```bash
git add src/lib/og.tsx "src/app/(marketing)" e2e/share-images.spec.ts
git commit -m "feat: share cards for every marketing page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task C3: Public invite page with a rich preview

**Files:**
- Create: `src/domain/leagues/invite-preview.ts`, `src/components/invite/public-invite.tsx`, `src/components/invite/track-invite-view.tsx`, `src/app/join/[code]/opengraph-image.tsx`
- Modify: `src/app/join/[code]/page.tsx`
- Test: `src/domain/leagues/invite-preview.test.ts`, `e2e/invite-preview.spec.ts`

**Interfaces:**
- Consumes: `createLeague` (tests), `tryParseLeagueSettings`, `FREE_TIER_MAX_ENTRIES`; C2 `renderOgImage`, `OG_SIZE`; A7 `captureClientEvent`.
- Produces:
  - `getInvitePreview(db, code: string): Promise<InvitePreview | null>`, where `InvitePreview = { leagueName: string; season: number; commissionerFirstName: string | null; draftScheduledAt: Date | null; draftStarted: boolean; entryCount: number; maxEntries: number }`
  - `firstName(name: string | null | undefined): string | null`
  - `formatDraftTime(date: Date): string`

- [ ] **Step 1: Write the failing unit test**

```ts
// src/domain/leagues/invite-preview.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { firstName, formatDraftTime, getInvitePreview } from "./invite-preview";

describe("getInvitePreview", () => {
  beforeEach(resetDb);

  it("shows what joining would show, and only the commissioner's first name", async () => {
    const commish = await createTestUser("Dana Q. Smith");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "Dana's Playoff League", teamName: "DT",
      scoringPreset: "standard", pickClockHours: 8,
    });

    const preview = await getInvitePreview(testDb, league.inviteCode.toLowerCase());
    expect(preview).toEqual({
      leagueName: "Dana's Playoff League",
      season: league.season,
      commissionerFirstName: "Dana",
      draftScheduledAt: null,
      draftStarted: false,
      entryCount: 1,
      maxEntries: 10,
    });
  });

  it("returns null for an unknown code", async () => {
    expect(await getInvitePreview(testDb, "NOPE1234")).toBeNull();
  });
});

describe("helpers", () => {
  it("firstName takes the first word and never returns an empty string", () => {
    expect(firstName("Cher")).toBe("Cher");
    expect(firstName("  Dana Q. Smith ")).toBe("Dana");
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });

  it("formatDraftTime is Eastern and says so", () => {
    expect(formatDraftTime(new Date("2027-01-11T01:00:00Z"))).toBe("Sun, Jan 10, 8:00 PM EST");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx dotenv -e .env.test -- npx vitest run src/domain/leagues/invite-preview.test.ts`
Expected: FAIL. Cannot find module `./invite-preview`.

- [ ] **Step 3: Implement the domain module**

```ts
// src/domain/leagues/invite-preview.ts
import type { PrismaClient } from "@prisma/client";
import { FREE_TIER_MAX_ENTRIES, tryParseLeagueSettings } from "../league-settings";

export interface InvitePreview {
  leagueName: string;
  season: number;
  commissionerFirstName: string | null;
  draftScheduledAt: Date | null;
  draftStarted: boolean;
  entryCount: number;
  maxEntries: number;
}

/**
 * What a signed-out visitor holding an invite code may see (spec §7). This is no more
 * than joining would reveal, and only the commissioner's first name.
 */
export async function getInvitePreview(db: PrismaClient, code: string): Promise<InvitePreview | null> {
  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: {
      _count: { select: { entries: true } },
      draft: { select: { id: true } },
      memberships: { where: { role: "COMMISSIONER" }, take: 1, include: { user: { select: { name: true } } } },
    },
  });
  if (!league) return null;
  const settings = tryParseLeagueSettings(league.settings);
  return {
    leagueName: league.name,
    season: league.season,
    commissionerFirstName: firstName(league.memberships[0]?.user.name),
    draftScheduledAt: league.draftScheduledAt,
    draftStarted: league.draft !== null,
    entryCount: league._count.entries,
    maxEntries: settings?.maxEntries ?? FREE_TIER_MAX_ENTRIES,
  };
}

export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function formatDraftTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}
```

Run the unit test. Expected: 4 passed. If `formatDraftTime` renders with a narrow no-break space before "PM" (some ICU versions do), normalize spaces in the implementation with `.replace(/ /g, " ")`. Don't loosen the test.

- [ ] **Step 4: Write the failing e2e test**

```ts
// e2e/invite-preview.spec.ts
import { test, expect } from "@playwright/test";
import { testDb, createTestUser } from "../tests/helpers/db";
import { createLeague } from "../src/domain/leagues/create-league";

test("a signed-out invite link shows the league and previews richly", async ({ page }) => {
  const commish = await createTestUser("Robin Example");
  const league = await createLeague(testDb, {
    userId: commish.id, name: `Robin's League ${Date.now()}`, teamName: "RT",
    scoringPreset: "standard", pickClockHours: 8,
  });

  await page.goto(`/join/${league.inviteCode}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(league.name);
  await expect(page.getByText(/Robin is running/)).toBeVisible();
  await expect(page.getByText("Example")).toHaveCount(0); // first name only
  await expect(page.getByRole("link", { name: /sign in to join/i })).toHaveAttribute(
    "href",
    `/sign-in?callbackURL=/join/${league.inviteCode}`,
  );

  await expect(page).toHaveTitle(`You're invited to ${league.name}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  const img = await page.request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
});

test("an unknown invite code says so", async ({ page }) => {
  await page.goto("/join/ZZZZ9999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/invite not found/i);
});
```

Run: `npx playwright test e2e/invite-preview.spec.ts`
Expected: FAIL. The first test is redirected to `/sign-in`.

- [ ] **Step 5: Implement the page, the components and the image**

```tsx
// src/components/invite/track-invite-view.tsx
"use client";

import { useEffect } from "react";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/** No league identifiers in the event, on purpose (spec §8.1). */
export function TrackInviteView() {
  useEffect(() => captureClientEvent(ANALYTICS_EVENTS.INVITE_PAGE_VIEWED), []);
  return null;
}
```

```tsx
// src/components/invite/public-invite.tsx
import Link from "next/link";
import { formatDraftTime, type InvitePreview } from "@/domain/leagues/invite-preview";
import { TrackInviteView } from "./track-invite-view";

export function PublicInvite({ code, preview }: { code: string; preview: InvitePreview }) {
  const full = preview.entryCount >= preview.maxEntries;
  return (
    <div className="theme-light flex flex-1 items-center justify-center p-4 sm:p-8">
      <TrackInviteView />
      <main className="card w-full max-w-md p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">You&apos;re invited</p>
        <h1 className="mt-2 text-3xl font-semibold text-balance">{preview.leagueName}</h1>
        <p className="mt-2 text-ink-soft">
          {preview.commissionerFirstName
            ? `${preview.commissionerFirstName} is running this ${preview.season} playoff best ball league.`
            : `A ${preview.season} playoff best ball league.`}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-lg bg-brand-tint p-3">
            <dt className="text-sm text-ink-soft">Draft</dt>
            <dd className="font-semibold text-ink">
              {preview.draftScheduledAt ? formatDraftTime(preview.draftScheduledAt) : "Not scheduled yet"}
            </dd>
          </div>
          <div className="rounded-lg bg-brand-tint p-3">
            <dt className="text-sm text-ink-soft">Teams</dt>
            <dd className="font-mono font-semibold text-ink">
              {preview.entryCount} of {preview.maxEntries}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          {preview.draftStarted ? (
            <p className="text-bad">The draft has already started, so this league is closed to new teams.</p>
          ) : full ? (
            <p className="text-bad">This league is full. The commissioner can upgrade to Premium for more spots.</p>
          ) : (
            <Link href={`/sign-in?callbackURL=/join/${code}`} className="btn btn-primary w-full">
              Sign in to join
            </Link>
          )}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          New to playoff best ball?{" "}
          <Link href="/how-it-works" className="font-semibold text-brand underline-offset-4 hover:underline">
            How it works
          </Link>
        </p>
      </main>
    </div>
  );
}
```

In `src/app/join/[code]/page.tsx`:
- Add imports: `import type { Metadata } from "next";`, `import { getInvitePreview, formatDraftTime } from "@/domain/leagues/invite-preview";` and `import { PublicInvite } from "@/components/invite/public-invite";`.
- Replace `if (!user) redirect(`/sign-in?callbackURL=/join/${code}`);` with:

```tsx
  // Signed out: a public invite page instead of a bare redirect, so the link a
  // commissioner pastes into the group chat previews as the league (spec §7).
  if (!user) {
    const preview = await getInvitePreview(db, code);
    if (!preview) return <InviteNotFound />;
    return <PublicInvite code={code.toUpperCase()} preview={preview} />;
  }
```

- Extract the existing "Invite not found" JSX into a local `function InviteNotFound()` in the same file and use it in both places.
- Add `generateMetadata`:

```tsx
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const preview = await getInvitePreview(db, code);
  // noindex everywhere: crawlable for link previews, never in search (plan: spec clarification 2).
  if (!preview) return { title: "Invite not found", robots: { index: false } };
  const who = preview.commissionerFirstName ? `${preview.commissionerFirstName}'s` : "A";
  const when = preview.draftScheduledAt ? `Draft ${formatDraftTime(preview.draftScheduledAt)}.` : "Draft time to be set.";
  return {
    title: { absolute: `You're invited to ${preview.leagueName}` },
    description: `${who} ${preview.season} playoff best ball league on Playoff Best Ball. ${when}`,
    robots: { index: false },
    twitter: { card: "summary_large_image" },
  };
}
```

```tsx
// src/app/join/[code]/opengraph-image.tsx
import { db } from "@/lib/db";
import { getInvitePreview } from "@/domain/leagues/invite-preview";
import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "League invite";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const preview = await getInvitePreview(db, code);
  if (!preview) return renderOgImage({ eyebrow: "Playoff Best Ball", title: "Invite not found" });
  return renderOgImage({
    eyebrow: "You're invited",
    title: preview.leagueName,
    footer: preview.commissionerFirstName ? `${preview.commissionerFirstName}'s playoff best ball league` : "Playoff best ball",
  });
}
```

- [ ] **Step 6: Run the tests, including the existing join flow**

Run: `npm run typecheck && npm run lint && npx dotenv -e .env.test -- npx vitest run src/domain/leagues/invite-preview.test.ts && npx playwright test e2e/invite-preview.spec.ts e2e/league-happy-path.spec.ts`
Expected: all pass. `league-happy-path` proves the signed-in join flow is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/domain/leagues/invite-preview.ts src/domain/leagues/invite-preview.test.ts src/components/invite "src/app/join/[code]" e2e/invite-preview.spec.ts
git commit -m "feat: public invite page with a rich share card for signed-out visitors

The invite link is the most-shared link in the product, and it used to preview in
group chats as a generic sign-in card.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task C4: Runbook, full verification, PR 3

**Files:**
- Modify: `docs/runbooks/production-setup.md`

- [ ] **Step 1: Add the remaining operator steps**

Append a new section to `docs/runbooks/production-setup.md`, numbered after the last existing section:

```markdown
## 12. Search, launch switch, rate limiting (marketing site)

1. **Google Search Console:** add the `playoffbestball.com` domain property, verify it
   with the DNS TXT record in Route 53, then submit `https://playoffbestball.com/sitemap.xml`.
   Only production is indexable: previews and the demo serve `Disallow: /`.
2. **Launch switch:** the homepage asks for an email until `SIGNUPS_OPEN_AT` in
   `src/lib/launch.ts`, then asks visitors to start a league. Set the final date in a
   reviewed PR. The home page revalidates hourly, so no deploy is needed at the moment
   it flips.
3. **Rate limit (optional):** if the Vercel plan supports custom Firewall rate-limit
   rules, add one for `POST /api/subscribe` (for example 10 requests per minute per IP).
   The app already throttles confirmation emails per address; this only stops floods
   of new addresses.
4. **Check share previews:** paste `https://playoffbestball.com/` and a real invite link
   into a link-preview debugger (and into iMessage or Slack) and confirm the cards render.
```

- [ ] **Step 2: Check the Vercel plan question**

Run `vercel project ls` or use the Vercel MCP `get_project` to see the team plan. Write the answer into item 3 ("available on this plan" or "not available on Hobby; skip"). This resolves spec open item §13 #2.

- [ ] **Step 3: Run the full CI mirror**

Run the "Full CI mirror" plus `npm run check:contrast && npm run check:static`.
Expected: everything green. Report the counts.

- [ ] **Step 4: Commit, push, open PR 3**

```bash
git add docs/runbooks/production-setup.md
git commit -m "docs: runbook for Search Console, the launch switch and subscribe rate limiting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/marketing-seo-invite
gh pr create --base feat/marketing-pages --title "feat: search, share cards and invite previews (piece 1, PR 3 of 3)" --body "$(cat <<'EOF'
Stacked on PR 2. Spec §6–§7, plan Phase C.

- `robots.txt` and `sitemap.xml`: only real production is indexable; previews and the demo project block everything.
- Share cards for every marketing page (`next/og`, cobalt).
- Signed-out `/join/[code]` is now a public invite page with a "You're invited to …" title and share card, instead of a redirect to sign-in. It is `noindex` and deliberately left crawlable so link-preview bots can fetch the card (plan, spec clarification 2). The signed-in join flow is unchanged.

Operator steps: runbook §12 (Search Console, launch date, optional rate limit).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
