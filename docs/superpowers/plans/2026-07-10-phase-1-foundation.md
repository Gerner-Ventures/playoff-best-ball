# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground-up rebuild foundation — a deployable multi-tenant app where a user signs in (Google/magic link), creates a league (with monetization gates), and friends join via invite link to claim entries.

**Architecture:** Fresh Next.js App Router app (prototype archived to `legacy/` for reference). Postgres via Prisma; Better Auth for identity (tables in our DB); pure-TypeScript domain services (`src/domain/`) that take a Prisma client as an argument (injectable for tests), with thin API routes on top. League settings (scoring, roster slots, pick clock) stored as versioned JSON on the League row — roster shape is data, per the spec.

**Tech Stack:** Next.js (App Router, TS), Tailwind, Prisma + Postgres (local Docker for dev/test, Neon in prod), Better Auth (Google + Apple + magic link; email/password enabled only in E2E test mode), Zod, Vitest, Playwright, Resend (magic-link email).

**Spec:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md`

**Phase 1 boundaries (YAGNI):** No draft, no players, no scoring sync, no Stripe (the one-free-league and 10-entry gates are enforced with clear errors; checkout wiring is Phase 4), no SMS/push (magic-link email only), no ads. Draft start time is not collected in the wizard — that belongs to Phase 2's Draft model.

---

## Conventions used throughout

- Domain services live in `src/domain/**`, are pure TS + Prisma, and never import from `next/*`.
- Domain errors are typed classes; API routes map them to HTTP statuses. Routes stay thin: parse → auth → service → map errors.
- Unit/integration tests run with Vitest against a real local Postgres (`TEST_DATABASE_URL`), reset between tests. UI is covered by one Playwright happy path, not component tests.
- Commit after every green test. Prefix: `feat:`, `chore:`, `test:`.

---

### Task 1: Archive prototype, scaffold fresh app

**Files:**
- Create: `legacy/` (entire prototype moved here)
- Create: fresh Next.js scaffold at repo root (`src/app/`, `package.json`, `tsconfig.json`, etc.)

- [ ] **Step 1: Move prototype to `legacy/`**

```bash
cd /home/ng/Code/playoff-best-ball
mkdir legacy
git mv src prisma scripts public package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs prisma.config.ts vercel.json legacy/
git mv IMPLEMENTATION_SUMMARY.md TESTING_CHECKLIST.md UI_ENHANCEMENTS_GUIDE.md README.md SPECWRIGHT.yaml security-hardening.md "Playoff Best Ball 2025.xlsx" legacy/
git commit -m "chore: archive prototype to legacy/ for reference during rebuild"
```

Keep `docs/` and `.github/` at root. If any listed file is already absent, skip it and continue.

- [ ] **Step 2: Scaffold Next.js in a temp dir and move it to root**

```bash
npx create-next-app@latest tmp-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
cp -r tmp-scaffold/. .
rm -rf tmp-scaffold
```

- [ ] **Step 3: Verify dev server boots**

Run: `npm run dev` — expect the Next.js starter page on http://localhost:3000. Ctrl-C after confirming.

- [ ] **Step 4: Ensure `legacy/` is excluded from the new toolchain**

In `tsconfig.json`, add to `exclude`:

```json
"exclude": ["node_modules", "legacy"]
```

In `eslint.config.mjs`, add `legacy/**` to the ignores entry (the scaffold includes an ignores block; append to it):

```js
{ ignores: ["legacy/**", ".next/**", "node_modules/**"] }
```

- [ ] **Step 5: Verify build passes and commit**

```bash
npm run build
git add -A
git commit -m "chore: scaffold fresh Next.js app for v1 rebuild"
```

---

### Task 2: Test harness (Vitest + local Postgres) proven with the invite-code module

**Files:**
- Create: `docker-compose.yml`, `vitest.config.ts`, `.env.test`, `tests/helpers/db.ts`
- Create: `src/domain/invite-code.ts`, `src/domain/invite-code.test.ts`
- Modify: `package.json` (scripts, deps)

- [ ] **Step 1: Install dependencies**

```bash
npm install zod nanoid @prisma/client better-auth resend
npm install -D vitest prisma dotenv-cli @playwright/test prettier
```

- [ ] **Step 2: Local Postgres for dev and test**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: pbb
      POSTGRES_PASSWORD: pbb
      POSTGRES_DB: pbb_dev
    ports:
      - "5432:5432"
    volumes:
      - pbb_pgdata:/var/lib/postgresql/data
  db-test:
    image: postgres:17
    environment:
      POSTGRES_USER: pbb
      POSTGRES_PASSWORD: pbb
      POSTGRES_DB: pbb_test
    ports:
      - "5433:5432"
volumes:
  pbb_pgdata:
```

Create `.env.test`:

```
DATABASE_URL="postgresql://pbb:pbb@localhost:5433/pbb_test"
```

(Vitest and the test `db push` both use `.env.test`, so the plain `DATABASE_URL` name works everywhere, including Prisma.)

- [ ] **Step 3: Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    fileParallelism: false, // tests share one Postgres; run files serially
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

Add scripts to `package.json`:

```json
"test": "dotenv -e .env.test -- vitest run",
"test:watch": "dotenv -e .env.test -- vitest",
"db:push": "prisma db push",
"db:push:test": "dotenv -e .env.test -- prisma db push"
```

- [ ] **Step 4: Write the failing test (invite codes)**

Create `src/domain/invite-code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateInviteCode, INVITE_CODE_ALPHABET } from "./invite-code";

describe("generateInviteCode", () => {
  it("returns an 8-character code", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  it("only uses unambiguous uppercase characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(INVITE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("does not repeat across many generations", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateInviteCode));
    expect(codes.size).toBe(1000);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- invite-code`
Expected: FAIL — cannot resolve `./invite-code`

- [ ] **Step 6: Implement**

Create `src/domain/invite-code.ts`:

```ts
import { customAlphabet } from "nanoid";

// No 0/O/1/I/L — codes get read aloud and retyped from group chats.
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const generateInviteCode = customAlphabet(INVITE_CODE_ALPHABET, 8);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- invite-code`
Expected: 3 passed

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: test harness (vitest + docker postgres) with invite-code module"
```

---

### Task 3: Prisma schema and client

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`
- Modify: `.env` (create), `.env.example` (create)

- [ ] **Step 1: Write the schema**

Create `prisma/schema.prisma`. The `user`/`session`/`account`/`verification` models are Better Auth's required shape (it reads/writes them via the Prisma adapter); domain models follow.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Better Auth (required shape) ----------

model User {
  id            String       @id
  name          String
  email         String       @unique
  emailVerified Boolean      @default(false)
  image         String?
  phone         String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  sessions      Session[]
  accounts      Account[]
  memberships   Membership[]

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("account")
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime? @default(now())
  updatedAt  DateTime? @updatedAt

  @@map("verification")
}

// ---------- Domain ----------

enum LeagueTier {
  FREE
  PREMIUM
}

enum MembershipRole {
  COMMISSIONER
  MEMBER
}

model League {
  id          String       @id @default(cuid())
  name        String
  season      Int // NFL season year; playoffs run the following January
  tier        LeagueTier   @default(FREE)
  inviteCode  String       @unique
  settings    Json // LeagueSettings (see src/domain/league-settings.ts), versioned via settingsVersion key
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  memberships Membership[]
  entries     Entry[]

  @@index([season])
}

model Membership {
  id        String         @id @default(cuid())
  league    League         @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  leagueId  String
  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  role      MembershipRole @default(MEMBER)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  entries   Entry[]

  @@unique([leagueId, userId])
  @@index([userId])
}

model Entry {
  id           String     @id @default(cuid())
  league       League     @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  leagueId     String
  membership   Membership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  membershipId String
  name         String // team name
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([leagueId])
}
```

- [ ] **Step 2: Env files**

Create `.env` (gitignored by the scaffold — verify):

```
DATABASE_URL="postgresql://pbb:pbb@localhost:5432/pbb_dev"
BETTER_AUTH_SECRET="dev-secret-change-me"
BETTER_AUTH_URL="http://localhost:3000"
```

Create `.env.example` (committed) with the same keys plus placeholders for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `RESEND_API_KEY` and a comment that empty OAuth vars disable that provider.

- [ ] **Step 3: Push schema to both databases**

```bash
docker compose up -d
npx prisma generate
npm run db:push
npm run db:push:test
```

Expected: both report the schema is in sync.

- [ ] **Step 4: Prisma client singleton**

Create `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 5: Test DB helpers**

Create `tests/helpers/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const testDb = new PrismaClient(); // DATABASE_URL comes from .env.test via dotenv-cli

export async function resetDb() {
  // Order matters: children before parents (cascades cover most, be explicit anyway)
  await testDb.entry.deleteMany();
  await testDb.membership.deleteMany();
  await testDb.league.deleteMany();
  await testDb.session.deleteMany();
  await testDb.account.deleteMany();
  await testDb.verification.deleteMany();
  await testDb.user.deleteMany();
}

export async function createTestUser(name = "Test User") {
  return testDb.user.create({
    data: {
      id: randomUUID(),
      name,
      email: `${randomUUID()}@example.com`,
    },
  });
}
```

- [ ] **Step 6: Verify tests still pass, commit**

Run: `npm test`
Expected: invite-code tests pass.

```bash
git add -A
git commit -m "feat: prisma schema (auth + league/membership/entry) and db client"
```

---

### Task 4: League settings domain — scoring presets, roster slots, defaults

**Files:**
- Create: `src/domain/league-settings.ts`, `src/domain/league-settings.test.ts`, `src/domain/season.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/league-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildDefaultSettings,
  SCORING_PRESETS,
  DEFAULT_ROSTER_SLOTS,
  leagueSettingsSchema,
} from "./league-settings";

describe("SCORING_PRESETS", () => {
  it("differ only in ppr across the three presets", () => {
    expect(SCORING_PRESETS.standard.ppr).toBe(0);
    expect(SCORING_PRESETS.half_ppr.ppr).toBe(0.5);
    expect(SCORING_PRESETS.full_ppr.ppr).toBe(1);
    const { ppr: _a, ...std } = SCORING_PRESETS.standard;
    const { ppr: _b, ...half } = SCORING_PRESETS.half_ppr;
    expect(std).toEqual(half);
  });
});

describe("buildDefaultSettings", () => {
  it("builds valid settings from a preset and pick clock", () => {
    const settings = buildDefaultSettings("half_ppr", 8);
    expect(settings.scoringPreset).toBe("half_ppr");
    expect(settings.scoring.ppr).toBe(0.5);
    expect(settings.pickClockHours).toBe(8);
    expect(settings.rosterSlots).toEqual(DEFAULT_ROSTER_SLOTS);
    expect(settings.maxEntries).toBe(10);
    expect(settings.substitutionsEnabled).toBe(false);
    expect(settings.settingsVersion).toBe(1);
    // round-trips through its own schema (what we store in League.settings JSON)
    expect(leagueSettingsSchema.parse(settings)).toEqual(settings);
  });
});

describe("DEFAULT_ROSTER_SLOTS", () => {
  it("is the spec's fixed v1 shape, ordered", () => {
    expect(DEFAULT_ROSTER_SLOTS.map((s) => s.slot)).toEqual([
      "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- league-settings`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/domain/season.ts`:

```ts
// NFL season year. The 2026 season's playoffs run January 2027.
export const CURRENT_SEASON = 2026;

// Playoff week indexes (spec: the prototype's week-5 Super Bowl quirk is not carried forward)
export const PLAYOFF_WEEKS = { WILD_CARD: 1, DIVISIONAL: 2, CONFERENCE: 3, SUPER_BOWL: 4 } as const;
```

Create `src/domain/league-settings.ts`:

```ts
import { z } from "zod";

export const scoringSettingsSchema = z.object({
  passYardsPerPoint: z.number(),
  passTd: z.number(),
  passInt: z.number(),
  rushYardsPerPoint: z.number(),
  rushTd: z.number(),
  recYardsPerPoint: z.number(),
  recTd: z.number(),
  ppr: z.number(),
  twoPtConv: z.number(),
  fumbleLost: z.number(),
  returnTd: z.number(),
  fg0_19: z.number(),
  fg20_29: z.number(),
  fg30_39: z.number(),
  fg40_49: z.number(),
  fg50Plus: z.number(),
  fgMiss: z.number(),
  xpMade: z.number(),
  xpMiss: z.number(),
  sack: z.number(),
  defInt: z.number(),
  fumRec: z.number(),
  dstTd: z.number(),
  safety: z.number(),
  block: z.number(),
  pa0: z.number(),
  pa1_6: z.number(),
  pa7_13: z.number(),
  pa14_20: z.number(),
  pa21_27: z.number(),
  pa28_34: z.number(),
  pa35Plus: z.number(),
});
export type ScoringSettings = z.infer<typeof scoringSettingsSchema>;

// Values carried over from the prototype's ScoringSettings defaults.
const BASE_SCORING: Omit<ScoringSettings, "ppr"> = {
  passYardsPerPoint: 30, passTd: 6, passInt: -2,
  rushYardsPerPoint: 10, rushTd: 6,
  recYardsPerPoint: 10, recTd: 6,
  twoPtConv: 2, fumbleLost: -2, returnTd: 6,
  fg0_19: 3, fg20_29: 3, fg30_39: 3, fg40_49: 4, fg50Plus: 5, fgMiss: -1,
  xpMade: 1, xpMiss: -1,
  sack: 1, defInt: 2, fumRec: 2, dstTd: 6, safety: 4, block: 2,
  pa0: 10, pa1_6: 7, pa7_13: 4, pa14_20: 1, pa21_27: 0, pa28_34: -1, pa35Plus: -3,
};

export const SCORING_PRESETS = {
  standard: { ...BASE_SCORING, ppr: 0 },
  half_ppr: { ...BASE_SCORING, ppr: 0.5 },
  full_ppr: { ...BASE_SCORING, ppr: 1 },
} satisfies Record<string, ScoringSettings>;

export const scoringPresetNameSchema = z.enum(["standard", "half_ppr", "full_ppr"]);
export type ScoringPresetName = z.infer<typeof scoringPresetNameSchema>;

export const positionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DST", "FLEX"]);
export const rosterSlotSchema = z.object({
  slot: positionSchema, // FLEX is a slot type; eligibility rules arrive with the draft (Phase 2)
});
export type RosterSlotDef = z.infer<typeof rosterSlotSchema>;

export const DEFAULT_ROSTER_SLOTS: RosterSlotDef[] = [
  { slot: "QB" }, { slot: "RB" }, { slot: "RB" }, { slot: "WR" }, { slot: "WR" },
  { slot: "TE" }, { slot: "FLEX" }, { slot: "K" }, { slot: "DST" },
];

export const pickClockHoursSchema = z.union([
  z.literal(2), z.literal(4), z.literal(8), z.literal(24),
]);
export type PickClockHours = z.infer<typeof pickClockHoursSchema>;

export const FREE_TIER_MAX_ENTRIES = 10;

export const leagueSettingsSchema = z.object({
  settingsVersion: z.literal(1),
  scoringPreset: z.union([scoringPresetNameSchema, z.literal("custom")]),
  scoring: scoringSettingsSchema,
  rosterSlots: z.array(rosterSlotSchema).min(1),
  pickClockHours: pickClockHoursSchema,
  overnightPause: z.boolean(),
  substitutionsEnabled: z.boolean(),
  entryFeeCents: z.number().int().nonnegative().nullable(), // display only, for dues tracking
  maxEntries: z.number().int().positive(),
});
export type LeagueSettings = z.infer<typeof leagueSettingsSchema>;

export function buildDefaultSettings(
  preset: ScoringPresetName,
  pickClockHours: PickClockHours,
): LeagueSettings {
  return {
    settingsVersion: 1,
    scoringPreset: preset,
    scoring: SCORING_PRESETS[preset],
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    pickClockHours,
    overnightPause: true,
    substitutionsEnabled: false,
    entryFeeCents: null,
    maxEntries: FREE_TIER_MAX_ENTRIES,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- league-settings`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: league settings domain (scoring presets, roster slots as data)"
```

---

### Task 5: `createLeague` service with the one-free-league gate

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/leagues/create-league.ts`
- Test: `src/domain/leagues/create-league.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/leagues/create-league.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { FreeLeagueLimitError } from "../errors";
import { CURRENT_SEASON } from "../season";

describe("createLeague", () => {
  beforeEach(resetDb);

  it("creates league + commissioner membership + entry in one shot", async () => {
    const user = await createTestUser("Nick");
    const league = await createLeague(testDb, {
      userId: user.id,
      name: "The Gerner Invitational",
      teamName: "Team Nick",
      scoringPreset: "half_ppr",
      pickClockHours: 8,
    });

    expect(league.season).toBe(CURRENT_SEASON);
    expect(league.tier).toBe("FREE");
    expect(league.inviteCode).toHaveLength(8);

    const membership = await testDb.membership.findUniqueOrThrow({
      where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
      include: { entries: true },
    });
    expect(membership.role).toBe("COMMISSIONER");
    expect(membership.entries).toHaveLength(1);
    expect(membership.entries[0].name).toBe("Team Nick");
  });

  it("stores validated settings JSON from the preset", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id,
      name: "L",
      teamName: "T",
      scoringPreset: "full_ppr",
      pickClockHours: 24,
    });
    const settings = league.settings as { scoring: { ppr: number }; pickClockHours: number };
    expect(settings.scoring.ppr).toBe(1);
    expect(settings.pickClockHours).toBe(24);
  });

  it("rejects a second FREE league for the same commissioner in a season", async () => {
    const user = await createTestUser();
    const input = {
      userId: user.id,
      name: "First",
      teamName: "T",
      scoringPreset: "standard" as const,
      pickClockHours: 8 as const,
    };
    await createLeague(testDb, input);
    await expect(createLeague(testDb, { ...input, name: "Second" })).rejects.toThrow(
      FreeLeagueLimitError,
    );
  });

  it("allows commissioning a league even when a member of others", async () => {
    const commish = await createTestUser("A");
    const member = await createTestUser("B");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L1", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await testDb.membership.create({
      data: { leagueId: league.id, userId: member.id, role: "MEMBER" },
    });
    // member commissions their own league — fine
    await expect(
      createLeague(testDb, {
        userId: member.id, name: "L2", teamName: "T2",
        scoringPreset: "standard", pickClockHours: 8,
      }),
    ).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- create-league`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement errors and service**

Create `src/domain/errors.ts`:

```ts
/** Base class so API routes can distinguish domain errors from bugs. */
export class DomainError extends Error {}

/** Free tier allows one commissioned league per season (spec: monetization gates). */
export class FreeLeagueLimitError extends DomainError {
  constructor() {
    super("Free tier includes one league per season. Upgrade to Premium to run more.");
  }
}

export class InvalidInviteError extends DomainError {
  constructor() {
    super("That invite code doesn't match any league.");
  }
}

export class LeagueFullError extends DomainError {
  constructor(max: number) {
    super(`This league is full (${max} entries). The commissioner can upgrade to Premium for more.`);
  }
}
```

Create `src/domain/leagues/create-league.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { generateInviteCode } from "../invite-code";
import { FreeLeagueLimitError } from "../errors";
import { CURRENT_SEASON } from "../season";
import {
  buildDefaultSettings,
  type PickClockHours,
  type ScoringPresetName,
} from "../league-settings";

export interface CreateLeagueInput {
  userId: string;
  name: string;
  teamName: string;
  scoringPreset: ScoringPresetName;
  pickClockHours: PickClockHours;
}

export async function createLeague(db: PrismaClient, input: CreateLeagueInput) {
  const existingFree = await db.league.count({
    where: {
      season: CURRENT_SEASON,
      tier: "FREE",
      memberships: { some: { userId: input.userId, role: "COMMISSIONER" } },
    },
  });
  if (existingFree >= 1) throw new FreeLeagueLimitError();

  const settings = buildDefaultSettings(input.scoringPreset, input.pickClockHours);

  // League + commissioner membership + entry must appear together or not at all.
  return db.$transaction(async (tx) => {
    const league = await tx.league.create({
      data: {
        name: input.name,
        season: CURRENT_SEASON,
        inviteCode: generateInviteCode(),
        settings,
      },
    });
    const membership = await tx.membership.create({
      data: { leagueId: league.id, userId: input.userId, role: "COMMISSIONER" },
    });
    await tx.entry.create({
      data: { leagueId: league.id, membershipId: membership.id, name: input.teamName },
    });
    return league;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- create-league` (Docker test DB must be up: `docker compose up -d`)
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: createLeague service with one-free-league gate"
```

---

### Task 6: `joinLeague` service with the 10-entry gate

**Files:**
- Create: `src/domain/leagues/join-league.ts`
- Test: `src/domain/leagues/join-league.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/leagues/join-league.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { joinLeague } from "./join-league";
import { InvalidInviteError, LeagueFullError } from "../errors";

async function setupLeague() {
  const commish = await createTestUser("Commish");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "Commish Team",
    scoringPreset: "standard", pickClockHours: 8,
  });
  return { commish, league };
}

describe("joinLeague", () => {
  beforeEach(resetDb);

  it("creates membership + entry from a valid invite code", async () => {
    const { league } = await setupLeague();
    const joiner = await createTestUser("Friend");
    const entry = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "Friend Team",
    });
    expect(entry.leagueId).toBe(league.id);
    expect(entry.name).toBe("Friend Team");
    const membership = await testDb.membership.findUniqueOrThrow({
      where: { leagueId_userId: { leagueId: league.id, userId: joiner.id } },
    });
    expect(membership.role).toBe("MEMBER");
  });

  it("is idempotent — rejoining returns the existing entry", async () => {
    const { league } = await setupLeague();
    const joiner = await createTestUser();
    const first = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "T",
    });
    const second = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "Different",
    });
    expect(second.id).toBe(first.id);
    expect(await testDb.entry.count({ where: { leagueId: league.id } })).toBe(2); // commish + joiner
  });

  it("rejects an unknown invite code", async () => {
    const joiner = await createTestUser();
    await expect(
      joinLeague(testDb, { userId: joiner.id, inviteCode: "NOPENOPE", teamName: "T" }),
    ).rejects.toThrow(InvalidInviteError);
  });

  it("rejects the 11th entry on a FREE league", async () => {
    const { league } = await setupLeague(); // entry 1 = commissioner
    for (let i = 0; i < 9; i++) {
      const u = await createTestUser(`U${i}`);
      await joinLeague(testDb, { userId: u.id, inviteCode: league.inviteCode, teamName: `T${i}` });
    }
    const eleventh = await createTestUser("Eleventh");
    await expect(
      joinLeague(testDb, { userId: eleventh.id, inviteCode: league.inviteCode, teamName: "T" }),
    ).rejects.toThrow(LeagueFullError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- join-league`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/domain/leagues/join-league.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { InvalidInviteError, LeagueFullError } from "../errors";
import { leagueSettingsSchema } from "../league-settings";

export interface JoinLeagueInput {
  userId: string;
  inviteCode: string;
  teamName: string;
}

export async function joinLeague(db: PrismaClient, input: JoinLeagueInput) {
  const league = await db.league.findUnique({
    where: { inviteCode: input.inviteCode.toUpperCase() },
  });
  if (!league) throw new InvalidInviteError();

  const existing = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: input.userId } },
    include: { entries: true },
  });
  if (existing?.entries[0]) return existing.entries[0];

  const settings = leagueSettingsSchema.parse(league.settings);
  const entryCount = await db.entry.count({ where: { leagueId: league.id } });
  if (entryCount >= settings.maxEntries) throw new LeagueFullError(settings.maxEntries);

  const membership =
    existing ??
    (await db.membership.create({
      data: { leagueId: league.id, userId: input.userId, role: "MEMBER" },
    }));

  return db.entry.create({
    data: { leagueId: league.id, membershipId: membership.id, name: input.teamName },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- join-league`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: joinLeague service with free-tier entry cap"
```

---

### Task 7: Better Auth server, route, and client

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`
- Create: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Auth server config**

Create `src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { db } from "./db";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  // E2E-only escape hatch: password auth lets Playwright create sessions
  // without an email round-trip. Never enabled in production.
  emailAndPassword: {
    enabled: process.env.E2E_TEST_MODE === "1",
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }),
    ...(process.env.APPLE_CLIENT_ID && {
      apple: {
        clientId: process.env.APPLE_CLIENT_ID,
        clientSecret: process.env.APPLE_CLIENT_SECRET!,
      },
    }),
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (!resend) {
          console.log(`[dev] magic link for ${email}: ${url}`);
          return;
        }
        await resend.emails.send({
          from: "Playoff Best Ball <auth@transactional.playoffbestball.com>",
          to: email,
          subject: "Your sign-in link",
          text: `Sign in to Playoff Best Ball: ${url}\n\nThis link expires in 5 minutes.`,
        });
      },
    }),
  ],
});
```

- [ ] **Step 2: Route handler**

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

- [ ] **Step 3: Browser client**

Create `src/lib/auth-client.ts`:

```ts
"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
```

- [ ] **Step 4: Server session helper**

Create `src/lib/session.ts`:

```ts
import { headers } from "next/headers";
import { auth } from "./auth";

/** Returns the signed-in user or null. Server components / route handlers only. */
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
```

- [ ] **Step 5: Verify the auth endpoint responds**

```bash
npm run dev &
sleep 5
curl -s http://localhost:3000/api/auth/ok
kill %1
```

Expected: `{"ok":true}`. If Better Auth's version doesn't expose `/ok`, verify instead with `curl -s -X POST http://localhost:3000/api/auth/sign-in/magic-link -H 'content-type: application/json' -d '{"email":"a@b.com"}'` returning a 200 and the dev console logging a magic link.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: better-auth with google/apple/magic-link (password in e2e mode only)"
```

---

### Task 8: App shell, sign-in page, dashboard

**Files:**
- Create: `src/app/sign-in/page.tsx`, `src/components/sign-in-form.tsx`
- Create: `src/app/dashboard/page.tsx`, `src/components/app-nav.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Root layout and landing page**

Replace `src/app/layout.tsx` metadata and body (keep the scaffold's font/css imports):

```tsx
export const metadata = {
  title: "Playoff Best Ball",
  description: "Run an NFL playoff best ball league with your friends.",
};
```

Replace `src/app/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Playoff Best Ball</h1>
      <p className="text-lg text-gray-600">
        Draft once. Watch all playoffs. Best ball scoring with your friends, January through the
        Super Bowl.
      </p>
      <Link
        href="/sign-in"
        className="rounded-lg bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
      >
        Get started
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Sign-in form (client component)**

Create `src/components/sign-in-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ callbackURL = "/dashboard" }: { callbackURL?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL });
    if (error) setError(error.message ?? "Something went wrong.");
    else setSent(true);
  }

  if (sent) {
    return <p className="text-center">Check your email — we sent a sign-in link to {email}.</p>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <button
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL })}
        className="rounded-lg border px-4 py-3 font-medium hover:bg-gray-50"
      >
        Continue with Google
      </button>
      <button
        onClick={() => authClient.signIn.social({ provider: "apple", callbackURL })}
        className="rounded-lg border px-4 py-3 font-medium hover:bg-gray-50"
      >
        Continue with Apple
      </button>
      <div className="text-center text-sm text-gray-500">or</div>
      <form onSubmit={sendLink} className="flex flex-col gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-lg border px-4 py-3"
        />
        <button type="submit" className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white">
          Email me a sign-in link
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

Create `src/app/sign-in/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const user = await getSessionUser();
  const { callbackURL } = await searchParams;
  if (user) redirect(callbackURL ?? "/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm callbackURL={callbackURL} />
    </main>
  );
}
```

- [ ] **Step 3: Nav and dashboard**

Create `src/components/app-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AppNav({ userName }: { userName: string }) {
  const router = useRouter();
  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <Link href="/dashboard" className="font-bold">
        Playoff Best Ball
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">{userName}</span>
        <button
          onClick={async () => {
            await authClient.signOut();
            router.push("/");
          }}
          className="text-gray-500 hover:underline"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
```

Create `src/app/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { league: true, entries: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My leagues</h1>
          <Link
            href="/leagues/new"
            className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white"
          >
            Create league
          </Link>
        </div>
        {memberships.length === 0 ? (
          <p className="text-gray-600">
            No leagues yet. Create one, or ask your commissioner for an invite link.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/leagues/${m.leagueId}`}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-semibold">{m.league.name}</div>
                    <div className="text-sm text-gray-500">
                      {m.entries[0]?.name ?? "No team"}
                      {m.role === "COMMISSIONER" && " · Commissioner"}
                    </div>
                  </div>
                  <span className="text-sm text-gray-400">{m.league.season} season</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, visit `/sign-in`, submit an email, copy the magic link from the dev console, open it — expect redirect to `/dashboard` with an empty league list.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: landing, sign-in, dashboard, app nav"
```

---

### Task 9: League creation API + wizard UI

**Files:**
- Create: `src/app/api/leagues/route.ts`
- Create: `src/app/leagues/new/page.tsx`, `src/components/create-league-form.tsx`

- [ ] **Step 1: API route**

Create `src/app/api/leagues/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createLeague } from "@/domain/leagues/create-league";
import { FreeLeagueLimitError } from "@/domain/errors";
import { pickClockHoursSchema, scoringPresetNameSchema } from "@/domain/league-settings";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  teamName: z.string().trim().min(1).max(40),
  scoringPreset: scoringPresetNameSchema,
  pickClockHours: pickClockHoursSchema,
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const league = await createLeague(db, { userId: user.id, ...parsed.data });
    return NextResponse.json({ leagueId: league.id, inviteCode: league.inviteCode }, { status: 201 });
  } catch (err) {
    if (err instanceof FreeLeagueLimitError) {
      // 402: premium required — Stripe checkout replaces this message in Phase 4
      return NextResponse.json({ error: err.message, code: "PREMIUM_REQUIRED" }, { status: 402 });
    }
    throw err;
  }
}
```

- [ ] **Step 2: Wizard form**

Create `src/components/create-league-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  { value: "standard", label: "Standard (no PPR)" },
  { value: "half_ppr", label: "Half PPR (0.5 pts/reception)" },
  { value: "full_ppr", label: "Full PPR (1 pt/reception)" },
] as const;

const CLOCKS = [
  { value: 2, label: "2 hours — fast draft" },
  { value: 4, label: "4 hours" },
  { value: 8, label: "8 hours — recommended" },
  { value: 24, label: "24 hours — very casual" },
] as const;

export function CreateLeagueForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [preset, setPreset] = useState<string>("half_ppr");
  const [clock, setClock] = useState<number>(8);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, teamName, scoringPreset: preset, pickClockHours: clock }),
    });
    if (res.ok) {
      const { leagueId } = await res.json();
      router.push(`/leagues/${leagueId}`);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="font-medium">League name</span>
        <input
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Gerner Invitational"
          className="rounded-lg border px-4 py-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Your team name</span>
        <input
          required
          maxLength={40}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team Nick"
          className="rounded-lg border px-4 py-3"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Scoring</legend>
        {PRESETS.map((p) => (
          <label key={p.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="preset"
              checked={preset === p.value}
              onChange={() => setPreset(p.value)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Draft pick clock</legend>
        {CLOCKS.map((c) => (
          <label key={c.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="clock"
              checked={clock === c.value}
              onChange={() => setClock(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create league"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

Create `src/app/leagues/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { CreateLeagueForm } from "@/components/create-league-form";

export default async function NewLeaguePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackURL=/leagues/new");
  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-6 text-2xl font-bold">Create your league</h1>
        <CreateLeagueForm />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Manual verification**

Dev server: sign in, create a league, expect redirect to `/leagues/<id>` (404 for now — page arrives in Task 11). Creating a second league should show the free-tier limit message.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: league creation API and wizard"
```

---

### Task 10: Join flow — API + `/join/[code]` page

**Files:**
- Create: `src/app/api/join/[code]/route.ts`
- Create: `src/app/join/[code]/page.tsx`, `src/components/join-league-form.tsx`

- [ ] **Step 1: API route (GET preview, POST join)**

Create `src/app/api/join/[code]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { joinLeague } from "@/domain/leagues/join-league";
import { InvalidInviteError, LeagueFullError } from "@/domain/errors";
import { leagueSettingsSchema } from "@/domain/league-settings";

type Params = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { entries: true } } },
  });
  if (!league) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  const settings = leagueSettingsSchema.parse(league.settings);
  return NextResponse.json({
    name: league.name,
    season: league.season,
    entryCount: league._count.entries,
    maxEntries: settings.maxEntries,
  });
}

const bodySchema = z.object({ teamName: z.string().trim().min(1).max(40) });

export async function POST(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { code } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const entry = await joinLeague(db, {
      userId: user.id,
      inviteCode: code,
      teamName: parsed.data.teamName,
    });
    return NextResponse.json({ leagueId: entry.leagueId }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInviteError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof LeagueFullError) {
      return NextResponse.json({ error: err.message, code: "LEAGUE_FULL" }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 2: Join page and form**

Create `src/components/join-league-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinLeagueForm({ code }: { code: string }) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/join/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamName }),
    });
    if (res.ok) {
      const { leagueId } = await res.json();
      router.push(`/leagues/${leagueId}`);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      <input
        required
        maxLength={40}
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="Your team name"
        className="rounded-lg border px-4 py-3"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Joining…" : "Join league"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

Create `src/app/join/[code]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { leagueSettingsSchema } from "@/domain/league-settings";
import { JoinLeagueForm } from "@/components/join-league-form";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/join/${code}`);

  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { entries: true } }, memberships: { where: { userId: user.id } } },
  });

  if (!league) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Invite not found</h1>
        <p className="mt-2 text-gray-600">Double-check the link with your commissioner.</p>
      </main>
    );
  }

  if (league.memberships.length > 0) redirect(`/leagues/${league.id}`);

  const settings = leagueSettingsSchema.parse(league.settings);
  const isFull = league._count.entries >= settings.maxEntries;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{league.name}</h1>
        <p className="mt-1 text-gray-600">
          {league.season} playoffs · {league._count.entries}/{settings.maxEntries} teams
        </p>
      </div>
      {isFull ? (
        <p className="text-center text-red-600">
          This league is full. The commissioner can upgrade to Premium for more spots.
        </p>
      ) : (
        <JoinLeagueForm code={code} />
      )}
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Create a league as user A; open the invite link in an incognito window; sign in as a different email; join; expect redirect to the league page (still 404 until Task 11).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: join flow via invite link"
```

---

### Task 11: League home page

**Files:**
- Create: `src/app/leagues/[leagueId]/page.tsx`, `src/components/invite-link-button.tsx`

- [ ] **Step 1: Invite copy button**

Create `src/components/invite-link-button.tsx`:

```tsx
"use client";

import { useState } from "react";

export function InviteLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      {copied ? "Copied!" : "Copy invite link"}
    </button>
  );
}
```

- [ ] **Step 2: League page (members only)**

Create `src/app/leagues/[leagueId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { leagueSettingsSchema } from "@/domain/league-settings";
import { AppNav } from "@/components/app-nav";
import { InviteLinkButton } from "@/components/invite-link-button";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}`);

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound(); // non-members can't see the league

  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: { include: { membership: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const settings = leagueSettingsSchema.parse(league.settings);
  const isCommissioner = membership.role === "COMMISSIONER";

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{league.name}</h1>
            <p className="text-sm text-gray-500">
              {league.season} playoffs · {league.entries.length}/{settings.maxEntries} teams ·{" "}
              {settings.scoringPreset.replace("_", " ")} scoring
            </p>
          </div>
          {isCommissioner && <InviteLinkButton code={league.inviteCode} />}
        </div>

        <h2 className="mb-3 font-semibold">Teams</h2>
        <ul className="flex flex-col gap-2">
          {league.entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">{entry.name}</span>
              <span className="text-sm text-gray-500">
                {entry.membership.user.name}
                {entry.membership.role === "COMMISSIONER" && " · Commissioner"}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          The draft opens once your league is set. Drafting, live scoring, and the leaderboard
          arrive in the next phases of the build.
        </p>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Manual verification**

Full loop in dev: create league → copy invite → join as second user → both teams listed; commissioner badge and invite button show only for the commissioner; a third signed-in non-member gets a 404.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: league home page with roster of entries and invite link"
```

---

### Task 12: Playwright end-to-end happy path

**Files:**
- Create: `playwright.config.ts`, `e2e/league-happy-path.spec.ts`
- Modify: `package.json` (scripts), `.env.test` (no change needed — E2E uses dev DB)

- [ ] **Step 1: Playwright config**

```bash
npx playwright install chromium
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    env: {
      E2E_TEST_MODE: "1",
      DATABASE_URL: "postgresql://pbb:pbb@localhost:5433/pbb_test",
      BETTER_AUTH_SECRET: "e2e-secret",
      BETTER_AUTH_URL: "http://localhost:3100",
    },
    reuseExistingServer: false,
  },
});
```

Add script: `"test:e2e": "dotenv -e .env.test -- playwright test"`.

- [ ] **Step 2: Write the E2E spec**

Create `e2e/league-happy-path.spec.ts`. Sign-up uses Better Auth's password endpoint (enabled only under `E2E_TEST_MODE=1`):

```ts
import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  // E2E_TEST_MODE enables the email/password endpoint; create the session via API,
  // cookies land on the page's context.
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok()).toBeTruthy();
}

test("create league, invite, join", async ({ browser }) => {
  const commishCtx = await browser.newContext();
  const commish = await commishCtx.newPage();
  await signUp(commish, "Commish", `commish-${Date.now()}@example.com`);

  // Create league
  await commish.goto("/leagues/new");
  await commish.getByPlaceholder("The Gerner Invitational").fill("E2E League");
  await commish.getByPlaceholder("Team Nick").fill("Commish Team");
  await commish.getByRole("button", { name: "Create league" }).click();
  await expect(commish.getByRole("heading", { name: "E2E League" })).toBeVisible();

  // Grab invite link
  await commish.getByRole("button", { name: "Copy invite link" }).click();
  const inviteUrl: string = await commish.evaluate(() => navigator.clipboard.readText());

  // Second user joins
  const friendCtx = await browser.newContext({ permissions: ["clipboard-read"] });
  const friend = await friendCtx.newPage();
  await signUp(friend, "Friend", `friend-${Date.now()}@example.com`);
  await friend.goto(inviteUrl);
  await friend.getByPlaceholder("Your team name").fill("Friend Team");
  await friend.getByRole("button", { name: "Join league" }).click();

  // Both teams visible
  await expect(friend.getByText("Commish Team")).toBeVisible();
  await expect(friend.getByText("Friend Team")).toBeVisible();

  await commishCtx.close();
  await friendCtx.close();
});
```

Note: clipboard read needs permissions on the *commissioner's* context too — if `clipboard.readText()` fails, create `commishCtx` with `{ permissions: ["clipboard-read", "clipboard-write"] }`.

- [ ] **Step 3: Run it**

Run: `npm run test:e2e`
Expected: 1 passed. Debug with `npx playwright test --headed` if needed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: e2e happy path — create league, invite, join"
```

---

### Task 13: CI, README, wrap-up

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`
- Modify: `package.json` (typecheck script)

- [ ] **Step 1: Typecheck script**

Add to `package.json`: `"typecheck": "tsc --noEmit"`.

- [ ] **Step 2: CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: pbb
          POSTGRES_PASSWORD: pbb
          POSTGRES_DB: pbb_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run db:push:test
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          DATABASE_URL: postgresql://pbb:pbb@localhost:5433/pbb_test
          BETTER_AUTH_SECRET: ci-secret
      - run: npx playwright install chromium --with-deps
      - run: npm run test:e2e
```

- [ ] **Step 3: README**

Create `README.md` covering: what the product is (one paragraph from the spec vision), local setup (`docker compose up -d`, `.env` from `.env.example`, `npm run db:push`, `npm run dev`), test commands (`npm test`, `npm run test:e2e`), the `legacy/` directory's purpose (prototype reference, removed after Phase 3), and a pointer to the spec and plans under `docs/superpowers/`.

- [ ] **Step 4: Full verification sweep**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: CI pipeline and README for the v1 rebuild"
```

---

## Deferred to later phases (explicit)

- **Phase 2:** Draft model/state machine, pick clocks (Inngest), autodraft, queues, notifications (SMS/push), Player pool
- **Phase 3:** StatsProvider + ESPN adapter, scoring engine, best-ball optimizer, leaderboard, player pages; delete `legacy/`
- **Phase 4:** Stripe checkout wired to the 402 gates, ads slot, dues tracking + fake door, recaps, premium analytics, Doppler/Terraform for vendor config
- **Phase 5:** Beta hardening, Vercel + Neon production deploy, PostHog
