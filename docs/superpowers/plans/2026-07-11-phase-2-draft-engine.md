# Phase 2: Draft Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The async slow snake draft — the core product: commissioner starts a draft, members pick on their own time with durable pick clocks, autodraft on timeout, and email "you're on the clock" notifications.

**Architecture:** Pure-TS draft logic (snake order, slot assignment with FLEX eligibility, overnight-pausing pick clocks) in `src/domain/draft/`, exhaustively unit-tested. DB-backed services follow the Phase 1 pattern (PrismaClient first arg, typed `DomainError`s, transactions with optimistic-concurrency guards). Player exclusivity and pick ordering are enforced by DB unique constraints, not just app logic. Inngest provides durable timers: each turn emits a `draft/turn.started` event; a function sleeps until the deadline and autodrafts if the pick wasn't made (idempotent guard). Draft board UI uses short polling. Notifications go through a channel abstraction that ships email-only; SMS + Web Push + PWA are **Phase 2.5** (separate plan).

**Tech Stack:** Existing Phase 1 stack + `inngest` (durable functions). No new UI libraries — queue reordering uses up/down buttons, not drag-and-drop.

**Spec:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md` (§6 Async draft)

**Phase 2 boundaries (YAGNI):** No SMS/push/PWA (Phase 2.5). No live realtime draft room. No scheduled draft start (commissioner clicks Start; scheduling can come with 2.5). No commissioner pause/undo tools. Player pool comes from a JSON fixture + seed script; the real ESPN-fed pool is Phase 3 (`Player.externalId` is staged for it). Autodraft fallback uses a static `defaultRank` on players, not projections (Phase 3/4).

---

## Conventions (carried from Phase 1 — read these files first)

- Domain services: `src/domain/**`, take `db: PrismaClient` as first arg, never import `next/*`. Reference: `src/domain/leagues/create-league.ts`, `join-league.ts`.
- Typed errors in `src/domain/errors.ts` extend `DomainError`; API routes map them to HTTP statuses and rethrow unknowns.
- `League.settings` JSON is read ONLY via `parseLeagueSettings` / `tryParseLeagueSettings` from `src/domain/league-settings.ts`.
- Tests: Vitest against real Postgres (test DB on 5433, `docker compose up -d` required), helpers in `tests/helpers/db.ts`, `beforeEach(resetDb)`. Run with `npm test`. TDD: write the failing test, watch it fail, implement, watch it pass.
- Session in routes/pages via `getSessionUser()` (`src/lib/session.ts`).
- Commit after every green test.

---

### Task 1: Type-design debt from the Phase 1 PR review

**Files:**
- Modify: `src/domain/errors.ts`
- Modify: `src/app/api/leagues/route.ts`, `src/app/api/join/[code]/route.ts`
- Modify: `src/domain/league-settings.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add machine codes to the error hierarchy**

Replace `src/domain/errors.ts` with:

```ts
/** Base class so API routes can distinguish domain errors from bugs. */
export class DomainError extends Error {
  constructor(
    message: string,
    /** Stable machine-readable code, emitted in API error bodies. */
    readonly code: string,
  ) {
    super(message);
  }
}

/** Free tier allows one commissioned league per season (spec: monetization gates). */
export class FreeLeagueLimitError extends DomainError {
  constructor() {
    super(
      "Free tier includes one league per season. Upgrade to Premium to run more.",
      "PREMIUM_REQUIRED",
    );
  }
}

export class InvalidInviteError extends DomainError {
  constructor() {
    super("That invite code doesn't match any league.", "INVALID_INVITE");
  }
}

export class LeagueFullError extends DomainError {
  constructor(max: number) {
    super(
      `This league is full (${max} entries). The commissioner can upgrade to Premium for more.`,
      "LEAGUE_FULL",
    );
  }
}
```

- [ ] **Step 2: Routes emit `err.code` instead of string literals**

In `src/app/api/leagues/route.ts`, the 402 branch becomes:

```ts
if (err instanceof FreeLeagueLimitError) {
  // 402: premium required — Stripe checkout replaces this message in Phase 4
  return NextResponse.json({ error: err.message, code: err.code }, { status: 402 });
}
```

In `src/app/api/join/[code]/route.ts`, the two domain-error branches become:

```ts
if (err instanceof InvalidInviteError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
}
if (err instanceof LeagueFullError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
}
```

- [ ] **Step 3: Finite scoring numbers + rename `positionSchema` → `slotTypeSchema`**

In `src/domain/league-settings.ts`:
- Add `const points = z.number().finite();` above `scoringSettingsSchema` and replace every `z.number()` inside `scoringSettingsSchema` with `points` (zod accepts `Infinity` otherwise, which does not survive JSON round-trips — latent corruption once custom scoring becomes editable).
- Rename `positionSchema` to `slotTypeSchema` (it contains `FLEX`, which is a slot type, not a player position — Task 2 introduces the real `PlayerPosition` enum). Update its one usage in `rosterSlotSchema`. Grep for `positionSchema` to confirm nothing else imports it.

- [ ] **Step 4: Enforce the Entry.leagueId denormalization with a composite FK**

In `prisma/schema.prisma`:
- On `Membership`, add `@@unique([id, leagueId])`.
- On `Entry`, change the membership relation to a composite reference so Postgres rejects any entry whose `leagueId` disagrees with its membership's:

```prisma
membership   Membership @relation(fields: [membershipId, leagueId], references: [id, leagueId], onDelete: Cascade)
```

- Update the comment above `Entry` to: `// Entry.leagueId is denormalized from membership.leagueId for league-scoped queries. The composite FK (membershipId, leagueId) → Membership(id, leagueId) makes the DB reject any mismatch.`

If Prisma rejects `leagueId` participating in both relations, note the exact error in your report and fall back to keeping the previous single-column relation + comment (do not fight the ORM). Run `npm run db:push` and `npm run db:push:test` (docker must be up).

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm run typecheck && npm test` — all existing tests must still pass (22).

```bash
git add -A
git commit -m "refactor: error codes, finite scoring numbers, slotTypeSchema, composite entry FK"
```

---

### Task 2: Draft schema — Player, Draft, DraftPick, DraftQueueItem

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `tests/helpers/db.ts`

- [ ] **Step 1: Add the models**

Append to `prisma/schema.prisma`:

```prisma
// Player position — no FLEX here; FLEX is a roster slot type (see league-settings).
enum PlayerPosition {
  QB
  RB
  WR
  TE
  K
  DST
}

model Player {
  id          String          @id @default(cuid())
  season      Int // NFL season year, matches League.season
  name        String
  position    PlayerPosition
  nflTeam     String // e.g. "KC"
  defaultRank Int // autodraft fallback order (1 = best); projections replace this in Phase 3
  externalId  String? // ESPN id, staged for Phase 3 StatsProvider
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  picks       DraftPick[]
  queueItems  DraftQueueItem[]

  @@unique([season, name, position])
  @@index([season, position])
  @@index([season, defaultRank])
}

enum DraftStatus {
  ACTIVE
  COMPLETE
}

model Draft {
  id               String      @id @default(cuid())
  league           League      @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  leagueId         String      @unique // one draft per league
  status           DraftStatus @default(ACTIVE)
  currentPickIndex Int         @default(0)
  currentDeadline  DateTime? // null once COMPLETE
  order            Json // ordered entryId[] (round-1 order); validated by draftOrderSchema
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  picks            DraftPick[]
}

model DraftPick {
  id          String   @id @default(cuid())
  draft       Draft    @relation(fields: [draftId], references: [id], onDelete: Cascade)
  draftId     String
  pickIndex   Int // 0-based overall pick number
  entry       Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  entryId     String
  player      Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  playerId    String
  slotIndex   Int // index into the league's settings.rosterSlots
  autodrafted Boolean  @default(false)
  madeAt      DateTime @default(now())

  @@unique([draftId, pickIndex]) // two racing picks for the same turn: loser gets P2002
  @@unique([draftId, playerId]) // player exclusivity, DB-enforced
  @@unique([draftId, entryId, slotIndex]) // a roster slot is filled at most once
  @@index([entryId])
}

model DraftQueueItem {
  id        String   @id @default(cuid())
  entry     Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  entryId   String
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  playerId  String
  rank      Int // 1 = draft first
  createdAt DateTime @default(now())

  @@unique([entryId, playerId])
  @@index([entryId, rank])
}
```

Also add the back-relations: `draft Draft?` on `League`; `picks DraftPick[]` and `queueItems DraftQueueItem[]` on `Entry`.

Note there is no SCHEDULED draft status: a Draft row is created at start time; "not started yet" = no row (YAGNI — scheduling arrives with Phase 2.5 at the earliest).

- [ ] **Step 2: Push to both DBs**

```bash
npm run db:push
npm run db:push:test
npx prisma generate
```

- [ ] **Step 3: Update test helpers**

In `tests/helpers/db.ts`, update `resetDb` (children before parents; Player is independent of League but parents picks/queue items):

```ts
export async function resetDb() {
  await testDb.draftQueueItem.deleteMany();
  await testDb.draftPick.deleteMany();
  await testDb.draft.deleteMany();
  await testDb.entry.deleteMany();
  await testDb.membership.deleteMany();
  await testDb.league.deleteMany();
  await testDb.player.deleteMany();
  await testDb.session.deleteMany();
  await testDb.account.deleteMany();
  await testDb.verification.deleteMany();
  await testDb.user.deleteMany();
}
```

Add a player factory (used heavily by draft tests):

```ts
import type { PlayerPosition } from "@prisma/client";
import { CURRENT_SEASON } from "@/domain/season";

let playerCounter = 0;

/** Creates a player with a unique name; lower defaultRank = drafted earlier by fallback autodraft. */
export async function createTestPlayer(
  position: PlayerPosition,
  overrides: { defaultRank?: number; name?: string; season?: number } = {},
) {
  playerCounter += 1;
  return testDb.player.create({
    data: {
      season: overrides.season ?? CURRENT_SEASON,
      name: overrides.name ?? `Player ${playerCounter} (${position})`,
      position,
      nflTeam: "KC",
      defaultRank: overrides.defaultRank ?? playerCounter,
    },
  });
}

/** A pool big enough to fully draft `entryCount` standard 9-slot rosters. */
export async function createStandardPool(entryCount: number) {
  const counts: [PlayerPosition, number][] = [
    ["QB", 2 * entryCount],
    ["RB", 3 * entryCount],
    ["WR", 3 * entryCount],
    ["TE", 2 * entryCount],
    ["K", entryCount + 1],
    ["DST", entryCount + 1],
  ];
  const players = [];
  for (const [position, n] of counts) {
    for (let i = 0; i < n; i++) players.push(await createTestPlayer(position));
  }
  return players;
}
```

(If `@/` imports don't resolve from `tests/`, use a relative import — vitest.config.ts aliases `@` to `src`, so `@/domain/season` works.)

- [ ] **Step 4: Verify and commit**

Run: `npm test` (all pass) and `npx tsc --noEmit`.

```bash
git add -A
git commit -m "feat: draft schema — player pool, draft, picks, queues"
```

---

### Task 3: Player pool fixture and seed script

**Files:**
- Create: `data/players-2026.json`
- Create: `prisma/seed-players.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Fixture**

Create `data/players-2026.json` — a dev/demo pool (~40 players; the real playoff pool is seeded via this same script with a fuller file once playoff teams are known in January, and Phase 3 automates it). Shape:

```json
{
  "season": 2026,
  "players": [
    { "name": "Patrick Mahomes", "position": "QB", "nflTeam": "KC", "defaultRank": 4 },
    { "name": "Josh Allen", "position": "QB", "nflTeam": "BUF", "defaultRank": 5 },
    { "name": "Lamar Jackson", "position": "QB", "nflTeam": "BAL", "defaultRank": 6 },
    { "name": "Jalen Hurts", "position": "QB", "nflTeam": "PHI", "defaultRank": 12 },
    { "name": "Jared Goff", "position": "QB", "nflTeam": "DET", "defaultRank": 18 },
    { "name": "Matthew Stafford", "position": "QB", "nflTeam": "LAR", "defaultRank": 24 },
    { "name": "Saquon Barkley", "position": "RB", "nflTeam": "PHI", "defaultRank": 1 },
    { "name": "Derrick Henry", "position": "RB", "nflTeam": "BAL", "defaultRank": 3 },
    { "name": "Jahmyr Gibbs", "position": "RB", "nflTeam": "DET", "defaultRank": 2 },
    { "name": "James Cook", "position": "RB", "nflTeam": "BUF", "defaultRank": 9 },
    { "name": "Isiah Pacheco", "position": "RB", "nflTeam": "KC", "defaultRank": 20 },
    { "name": "Kyren Williams", "position": "RB", "nflTeam": "LAR", "defaultRank": 10 },
    { "name": "David Montgomery", "position": "RB", "nflTeam": "DET", "defaultRank": 21 },
    { "name": "Kareem Hunt", "position": "RB", "nflTeam": "KC", "defaultRank": 30 },
    { "name": "Ja'Marr Chase", "position": "WR", "nflTeam": "CIN", "defaultRank": 7 },
    { "name": "Amon-Ra St. Brown", "position": "WR", "nflTeam": "DET", "defaultRank": 8 },
    { "name": "A.J. Brown", "position": "WR", "nflTeam": "PHI", "defaultRank": 11 },
    { "name": "Puka Nacua", "position": "WR", "nflTeam": "LAR", "defaultRank": 13 },
    { "name": "Stefon Diggs", "position": "WR", "nflTeam": "BUF", "defaultRank": 16 },
    { "name": "Rashee Rice", "position": "WR", "nflTeam": "KC", "defaultRank": 17 },
    { "name": "Tee Higgins", "position": "WR", "nflTeam": "CIN", "defaultRank": 15 },
    { "name": "DeVonta Smith", "position": "WR", "nflTeam": "PHI", "defaultRank": 19 },
    { "name": "Cooper Kupp", "position": "WR", "nflTeam": "LAR", "defaultRank": 22 },
    { "name": "Khalil Shakir", "position": "WR", "nflTeam": "BUF", "defaultRank": 27 },
    { "name": "Travis Kelce", "position": "TE", "nflTeam": "KC", "defaultRank": 14 },
    { "name": "Sam LaPorta", "position": "TE", "nflTeam": "DET", "defaultRank": 23 },
    { "name": "Dallas Goedert", "position": "TE", "nflTeam": "PHI", "defaultRank": 28 },
    { "name": "Dalton Kincaid", "position": "TE", "nflTeam": "BUF", "defaultRank": 31 },
    { "name": "Harrison Butker", "position": "K", "nflTeam": "KC", "defaultRank": 33 },
    { "name": "Jake Bates", "position": "K", "nflTeam": "DET", "defaultRank": 34 },
    { "name": "Tyler Bass", "position": "K", "nflTeam": "BUF", "defaultRank": 36 },
    { "name": "Jake Elliott", "position": "K", "nflTeam": "PHI", "defaultRank": 37 },
    { "name": "Ravens D/ST", "position": "DST", "nflTeam": "BAL", "defaultRank": 32 },
    { "name": "Eagles D/ST", "position": "DST", "nflTeam": "PHI", "defaultRank": 35 },
    { "name": "Chiefs D/ST", "position": "DST", "nflTeam": "KC", "defaultRank": 38 },
    { "name": "Lions D/ST", "position": "DST", "nflTeam": "DET", "defaultRank": 39 },
    { "name": "Bills D/ST", "position": "DST", "nflTeam": "BUF", "defaultRank": 40 }
  ]
}
```

(Names are dev fixtures — accuracy doesn't matter, position/team spread does.)

- [ ] **Step 2: Seed script**

Create `prisma/seed-players.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const fileSchema = z.object({
  season: z.number().int(),
  players: z.array(
    z.object({
      name: z.string().min(1),
      position: z.enum(["QB", "RB", "WR", "TE", "K", "DST"]),
      nflTeam: z.string().min(2).max(3),
      defaultRank: z.number().int().positive(),
    }),
  ),
});

/** Idempotent: upserts by (season, name, position); safe to re-run after editing the fixture. */
export async function seedPlayers(db: PrismaClient, filePath: string) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const { season, players } = fileSchema.parse(raw);
  for (const p of players) {
    await db.player.upsert({
      where: { season_name_position: { season, name: p.name, position: p.position } },
      create: { season, ...p },
      update: { nflTeam: p.nflTeam, defaultRank: p.defaultRank },
    });
  }
  return players.length;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const file = path.join(__dirname, "..", "data", "players-2026.json");
  const count = await seedPlayers(db, file);
  console.log(`Seeded ${count} players`);
  await db.$disconnect();
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

**Adaptation note:** verify the import paths against `src/lib/db.ts` (same client + adapter pattern). If `require.main` doesn't exist under the runner, just call `main()` unconditionally — the script is only ever run directly. Run it with `tsx` (add as dev dep if not present: `npm i -D tsx`).

Add scripts to `package.json`:

```json
"db:seed:players": "dotenv -e .env -- tsx prisma/seed-players.ts",
"db:seed:players:test": "dotenv -e .env.test -- tsx prisma/seed-players.ts"
```

- [ ] **Step 3: Run and verify**

```bash
npm run db:seed:players
npm run db:seed:players -- # run twice: idempotency — second run must not error or duplicate
npm run db:seed:players:test
```

Verify count: `docker compose exec db psql -U pbb -d pbb_dev -c 'select count(*) from "Player";'` → 38.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: player pool fixture and idempotent seed script"
```

---

### Task 4: Draft errors + snake-order module

**Files:**
- Modify: `src/domain/errors.ts`
- Create: `src/domain/draft/snake-order.ts`
- Test: `src/domain/draft/snake-order.test.ts`

- [ ] **Step 1: Add draft error classes**

Append to `src/domain/errors.ts`:

```ts
export class NotCommissionerError extends DomainError {
  constructor() {
    super("Only the commissioner can do that.", "NOT_COMMISSIONER");
  }
}

export class TooFewEntriesError extends DomainError {
  constructor() {
    super("You need at least 2 teams before starting the draft.", "TOO_FEW_ENTRIES");
  }
}

export class DraftAlreadyStartedError extends DomainError {
  constructor() {
    super("The draft has already started.", "DRAFT_ALREADY_STARTED");
  }
}

export class DraftNotActiveError extends DomainError {
  constructor() {
    super("The draft isn't active.", "DRAFT_NOT_ACTIVE");
  }
}

export class NotYourTurnError extends DomainError {
  constructor() {
    super("It's not your pick.", "NOT_YOUR_TURN");
  }
}

export class PlayerUnavailableError extends DomainError {
  constructor() {
    super("That player isn't available.", "PLAYER_UNAVAILABLE");
  }
}

export class NoSlotForPositionError extends DomainError {
  constructor(position: string) {
    super(`You have no open roster slot for a ${position}.`, "NO_SLOT_FOR_POSITION");
  }
}

/** A concurrent pick advanced the draft first; the caller should refetch and retry. */
export class PickConflictError extends DomainError {
  constructor() {
    super("Someone else's pick landed first — refresh and try again.", "PICK_CONFLICT");
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/domain/draft/snake-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  entryIndexForPick,
  entryIdForPick,
  totalPicks,
  shuffleOrder,
  draftOrderSchema,
} from "./snake-order";

describe("entryIndexForPick", () => {
  it("snakes: 0,1,2,2,1,0,0,1,2 for 3 entries", () => {
    const got = Array.from({ length: 9 }, (_, i) => entryIndexForPick(3, i));
    expect(got).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
  });

  it("handles 2 entries", () => {
    const got = Array.from({ length: 6 }, (_, i) => entryIndexForPick(2, i));
    expect(got).toEqual([0, 1, 1, 0, 0, 1]);
  });
});

describe("entryIdForPick", () => {
  it("maps through the order array", () => {
    expect(entryIdForPick(["a", "b", "c"], 3)).toBe("c"); // round 2 reverses
    expect(entryIdForPick(["a", "b", "c"], 5)).toBe("a");
  });
});

describe("totalPicks", () => {
  it("is entries × roster slots", () => {
    expect(totalPicks(10, 9)).toBe(90);
  });
});

describe("shuffleOrder", () => {
  it("returns a permutation of the input", () => {
    const input = ["a", "b", "c", "d", "e"];
    const out = shuffleOrder(input);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual(["a", "b", "c", "d", "e"]); // input not mutated
  });
});

describe("draftOrderSchema", () => {
  it("accepts a string array of ≥2 and rejects junk", () => {
    expect(draftOrderSchema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(draftOrderSchema.safeParse(["a"]).success).toBe(false);
    expect(draftOrderSchema.safeParse("nope").success).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify FAIL** — `npm test -- snake-order` → module not found.

- [ ] **Step 4: Implement**

Create `src/domain/draft/snake-order.ts`:

```ts
import { z } from "zod";

/** Draft.order JSON: entryIds in round-1 pick order. */
export const draftOrderSchema = z.array(z.string()).min(2);
export type DraftOrder = z.infer<typeof draftOrderSchema>;

/** 0-based position in `order` that owns overall pick `pickIndex` (snake: odd rounds reverse). */
export function entryIndexForPick(entryCount: number, pickIndex: number): number {
  const round = Math.floor(pickIndex / entryCount);
  const pos = pickIndex % entryCount;
  return round % 2 === 0 ? pos : entryCount - 1 - pos;
}

export function entryIdForPick(order: readonly string[], pickIndex: number): string {
  return order[entryIndexForPick(order.length, pickIndex)];
}

export function totalPicks(entryCount: number, slotCount: number): number {
  return entryCount * slotCount;
}

/** Fisher–Yates; returns a new array. */
export function shuffleOrder(entryIds: readonly string[]): string[] {
  const out = [...entryIds];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 5: Run to verify PASS** — `npm test -- snake-order`. Then full `npm test` + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: draft errors and snake-order module"
```

---

### Task 5: Slot assignment (FLEX eligibility)

**Files:**
- Create: `src/domain/draft/slot-assignment.ts`
- Test: `src/domain/draft/slot-assignment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/draft/slot-assignment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assignSlot, FLEX_ELIGIBLE } from "./slot-assignment";
import { DEFAULT_ROSTER_SLOTS } from "../league-settings";

// DEFAULT_ROSTER_SLOTS: [QB, RB, RB, WR, WR, TE, FLEX, K, DST] (indexes 0-8)

describe("assignSlot", () => {
  it("fills the direct slot first", () => {
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [], "RB")).toBe(1);
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [1], "RB")).toBe(2);
  });

  it("overflows RB/WR/TE into FLEX when direct slots are full", () => {
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [1, 2], "RB")).toBe(6);
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [3, 4], "WR")).toBe(6);
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [5], "TE")).toBe(6);
  });

  it("returns null when nothing fits", () => {
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [1, 2, 6], "RB")).toBeNull();
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [0], "QB")).toBeNull(); // QB never flexes
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [7], "K")).toBeNull();
  });

  it("FLEX_ELIGIBLE is RB/WR/TE", () => {
    expect(FLEX_ELIGIBLE).toEqual(["RB", "WR", "TE"]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- slot-assignment`.

- [ ] **Step 3: Implement**

Create `src/domain/draft/slot-assignment.ts`:

```ts
import type { PlayerPosition } from "@prisma/client";
import type { RosterSlotDef } from "../league-settings";

export const FLEX_ELIGIBLE: PlayerPosition[] = ["RB", "WR", "TE"];

/**
 * Which roster slot (index into rosterSlots) a player of `position` fills for an
 * entry whose already-filled slot indexes are `filledSlotIndexes`.
 * Direct slot first, then FLEX for eligible positions. null = no legal slot.
 */
export function assignSlot(
  rosterSlots: readonly RosterSlotDef[],
  filledSlotIndexes: readonly number[],
  position: PlayerPosition,
): number | null {
  const filled = new Set(filledSlotIndexes);
  const direct = rosterSlots.findIndex((s, i) => !filled.has(i) && s.slot === position);
  if (direct !== -1) return direct;
  if (FLEX_ELIGIBLE.includes(position)) {
    const flex = rosterSlots.findIndex((s, i) => !filled.has(i) && s.slot === "FLEX");
    if (flex !== -1) return flex;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify PASS**, full suite, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: slot assignment with FLEX eligibility"
```

---

### Task 6: Pick clock with overnight pause

**Files:**
- Create: `src/domain/draft/pick-clock.ts`
- Test: `src/domain/draft/pick-clock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/draft/pick-clock.test.ts`. All fixtures are January dates (EST, UTC-5 — no DST edge in playoff season):

```ts
import { describe, it, expect } from "vitest";
import { computePickDeadline } from "./pick-clock";

describe("computePickDeadline", () => {
  it("without pause: from + clockHours exactly", () => {
    const from = new Date("2027-01-05T15:00:00Z"); // 10:00 ET
    expect(computePickDeadline(from, 8, false).toISOString()).toBe("2027-01-05T23:00:00.000Z");
  });

  it("clock that never touches the pause window is unaffected", () => {
    const from = new Date("2027-01-05T15:00:00Z"); // 10:00 ET
    expect(computePickDeadline(from, 4, true).toISOString()).toBe("2027-01-05T19:00:00.000Z");
  });

  it("pauses between 1am and 8am ET", () => {
    // 23:00 ET Jan 5 = 04:00Z Jan 6. 2h runs to 01:00 ET, pause to 08:00 ET, 2h more → 10:00 ET.
    const from = new Date("2027-01-06T04:00:00Z");
    expect(computePickDeadline(from, 4, true).toISOString()).toBe("2027-01-06T15:00:00.000Z");
  });

  it("a clock starting inside the pause window starts counting at 8am ET", () => {
    const from = new Date("2027-01-06T08:00:00Z"); // 03:00 ET
    expect(computePickDeadline(from, 2, true).toISOString()).toBe("2027-01-06T15:00:00.000Z"); // 10:00 ET
  });

  it("a 24h clock spans a full pause and lands 7h later than naive", () => {
    const from = new Date("2027-01-05T17:00:00Z"); // 12:00 ET
    // naive: 12:00 ET next day; one 1am–8am pause inside → +7h → 19:00 ET = 00:00Z Jan 7
    expect(computePickDeadline(from, 24, true).toISOString()).toBe("2027-01-07T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- pick-clock`.

- [ ] **Step 3: Implement**

Create `src/domain/draft/pick-clock.ts`:

```ts
// The pick clock freezes overnight (1:00–8:00 ET) when the league enables overnightPause,
// so nobody loses their pick while asleep. Minute-granularity walk: pick clocks are
// hours long, deadlines don't need sub-minute precision, and walking avoids hand-rolled
// timezone math (Intl handles ET, including DST if a draft ever runs outside January).

const PAUSE_START_HOUR_ET = 1; // inclusive
const PAUSE_END_HOUR_ET = 8; // exclusive
const MINUTE_MS = 60_000;

const etHour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hourCycle: "h23",
});

function inPauseWindow(instant: Date): boolean {
  const hour = Number(etHour.format(instant));
  return hour >= PAUSE_START_HOUR_ET && hour < PAUSE_END_HOUR_ET;
}

export function computePickDeadline(
  from: Date,
  clockHours: number,
  overnightPause: boolean,
): Date {
  if (!overnightPause) return new Date(from.getTime() + clockHours * 3_600_000);
  let remainingMinutes = clockHours * 60;
  let cursor = from.getTime();
  while (remainingMinutes > 0) {
    cursor += MINUTE_MS;
    if (!inPauseWindow(new Date(cursor))) remainingMinutes -= 1;
  }
  return new Date(cursor);
}
```

- [ ] **Step 4: Run to verify PASS**, full suite, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pick clock with overnight pause (ET)"
```

---

### Task 7: `startDraft` service

**Files:**
- Create: `src/domain/draft/start-draft.ts`
- Test: `src/domain/draft/start-draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/draft/start-draft.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { joinLeague } from "../leagues/join-league";
import { startDraft } from "./start-draft";
import {
  DraftAlreadyStartedError,
  NotCommissionerError,
  TooFewEntriesError,
} from "../errors";
import { draftOrderSchema } from "./snake-order";

async function leagueWithMembers(memberCount: number) {
  const commish = await createTestUser("Commish");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "Commish Team",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    const u = await createTestUser(`M${i}`);
    await joinLeague(testDb, { userId: u.id, inviteCode: league.inviteCode, teamName: `T${i}` });
    members.push(u);
  }
  return { commish, league, members };
}

describe("startDraft", () => {
  beforeEach(resetDb);

  it("creates an ACTIVE draft with a shuffled order and a first deadline", async () => {
    const { commish, league } = await leagueWithMembers(2);
    const before = Date.now();
    const draft = await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    expect(draft.status).toBe("ACTIVE");
    expect(draft.currentPickIndex).toBe(0);
    const order = draftOrderSchema.parse(draft.order);
    const entries = await testDb.entry.findMany({ where: { leagueId: league.id } });
    expect([...order].sort()).toEqual(entries.map((e) => e.id).sort());
    expect(draft.currentDeadline!.getTime()).toBeGreaterThan(before);
  });

  it("accepts an explicit order that is a permutation of the entries", async () => {
    const { commish, league } = await leagueWithMembers(1);
    const entries = await testDb.entry.findMany({ where: { leagueId: league.id } });
    const order = entries.map((e) => e.id).reverse();
    const draft = await startDraft(testDb, { leagueId: league.id, userId: commish.id, order });
    expect(draft.order).toEqual(order);
  });

  it("rejects an order that isn't a permutation", async () => {
    const { commish, league } = await leagueWithMembers(1);
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: commish.id, order: ["bogus", "ids"] }),
    ).rejects.toThrow(/order must contain each entry exactly once/i);
  });

  it("only the commissioner can start", async () => {
    const { league, members } = await leagueWithMembers(1);
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: members[0].id }),
    ).rejects.toThrow(NotCommissionerError);
  });

  it("needs at least 2 entries", async () => {
    const { commish, league } = await leagueWithMembers(0);
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: commish.id }),
    ).rejects.toThrow(TooFewEntriesError);
  });

  it("cannot start twice", async () => {
    const { commish, league } = await leagueWithMembers(1);
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: commish.id }),
    ).rejects.toThrow(DraftAlreadyStartedError);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- start-draft`.

- [ ] **Step 3: Implement**

Create `src/domain/draft/start-draft.ts`:

```ts
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  DraftAlreadyStartedError,
  NotCommissionerError,
  TooFewEntriesError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";
import { computePickDeadline } from "./pick-clock";
import { shuffleOrder } from "./snake-order";

export interface StartDraftInput {
  leagueId: string;
  userId: string;
  /** Optional explicit round-1 order (entryIds); randomized when omitted. */
  order?: string[];
}

export async function startDraft(db: PrismaClient, input: StartDraftInput) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();

  const league = await db.league.findUniqueOrThrow({
    where: { id: input.leagueId },
    include: { entries: true, draft: true },
  });
  if (league.draft) throw new DraftAlreadyStartedError();
  if (league.entries.length < 2) throw new TooFewEntriesError();

  const entryIds = league.entries.map((e) => e.id);
  const order = input.order ?? shuffleOrder(entryIds);
  const isPermutation =
    order.length === entryIds.length && [...order].sort().join() === [...entryIds].sort().join();
  if (!isPermutation) {
    throw new Error("order must contain each entry exactly once");
  }

  const settings = parseLeagueSettings(league.settings);
  const deadline = computePickDeadline(new Date(), settings.pickClockHours, settings.overnightPause);

  try {
    return await db.draft.create({
      data: {
        leagueId: league.id,
        status: "ACTIVE",
        currentPickIndex: 0,
        currentDeadline: deadline,
        order: order as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Two simultaneous starts: loser hits the unique leagueId constraint.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DraftAlreadyStartedError();
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run to verify PASS**, full suite, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: startDraft service with order randomization and start-race guard"
```

---

### Task 8: `makePick` service (+ shared advance transaction)

**Files:**
- Create: `src/domain/draft/advance.ts`
- Create: `src/domain/draft/make-pick.ts`
- Test: `src/domain/draft/make-pick.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/draft/make-pick.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createTestPlayer, createStandardPool,
} from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { joinLeague } from "../leagues/join-league";
import { startDraft } from "./start-draft";
import { makePick } from "./make-pick";
import { entryIdForPick, draftOrderSchema } from "./snake-order";
import {
  DraftNotActiveError, NotYourTurnError, PlayerUnavailableError, NoSlotForPositionError,
} from "../errors";

/** 2-user league with a started draft using a fixed order [commishEntry, friendEntry]. */
async function draftSetup() {
  const commish = await createTestUser("Commish");
  const friend = await createTestUser("Friend");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "CT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
  const entries = await testDb.entry.findMany({
    where: { leagueId: league.id }, orderBy: { createdAt: "asc" },
  });
  const order = entries.map((e) => e.id); // commish first, friend second
  const draft = await startDraft(testDb, { leagueId: league.id, userId: commish.id, order });
  return { commish, friend, league, draft, order };
}

describe("makePick", () => {
  beforeEach(resetDb);

  it("records the pick with the right slot and advances turn + deadline", async () => {
    const { commish, league, order } = await draftSetup();
    const rb = await createTestPlayer("RB");
    const result = await makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: rb.id });
    expect(result.pick.pickIndex).toBe(0);
    expect(result.pick.slotIndex).toBe(1); // first RB slot in the default shape
    expect(result.pick.autodrafted).toBe(false);
    expect(result.draft.currentPickIndex).toBe(1);
    expect(result.draft.currentDeadline).not.toBeNull();
    expect(entryIdForPick(draftOrderSchema.parse(result.draft.order), 1)).toBe(order[1]);
  });

  it("rejects a pick out of turn", async () => {
    const { friend, league } = await draftSetup();
    const rb = await createTestPlayer("RB");
    await expect(
      makePick(testDb, { leagueId: league.id, userId: friend.id, playerId: rb.id }),
    ).rejects.toThrow(NotYourTurnError);
  });

  it("rejects an already-drafted player", async () => {
    const { commish, friend, league } = await draftSetup();
    const rb = await createTestPlayer("RB");
    await makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: rb.id });
    await expect(
      makePick(testDb, { leagueId: league.id, userId: friend.id, playerId: rb.id }),
    ).rejects.toThrow(PlayerUnavailableError);
  });

  it("rejects a player from another season", async () => {
    const { commish, league } = await draftSetup();
    const old = await createTestPlayer("RB", { season: 2025 });
    await expect(
      makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: old.id }),
    ).rejects.toThrow(PlayerUnavailableError);
  });

  it("rejects a position with no open slot (snake through 2 rounds first)", async () => {
    const { commish, friend, league } = await draftSetup();
    const qb1 = await createTestPlayer("QB");
    const qb2 = await createTestPlayer("QB");
    const qb3 = await createTestPlayer("QB");
    const rb = await createTestPlayer("RB");
    await makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: qb1.id }); // pick 0: commish QB
    await makePick(testDb, { leagueId: league.id, userId: friend.id, playerId: qb2.id }); // pick 1: friend QB
    await makePick(testDb, { leagueId: league.id, userId: friend.id, playerId: rb.id }); // pick 2: friend again (snake)
    // pick 3 is commish; their QB slot is full and QB never flexes
    await expect(
      makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: qb3.id }),
    ).rejects.toThrow(NoSlotForPositionError);
  });

  it("completes the draft on the final pick", async () => {
    const { commish, friend, league, order } = await draftSetup();
    await createStandardPool(2);
    // Drive the whole 18-pick draft by always picking the best available legal player.
    const users: Record<string, string> = {
      [order[0]]: commish.id,
      [order[1]]: friend.id,
    };
    for (let i = 0; i < 18; i++) {
      const draft = await testDb.draft.findUniqueOrThrow({ where: { leagueId: league.id }, include: { picks: true } });
      const onClock = entryIdForPick(draftOrderSchema.parse(draft.order), draft.currentPickIndex);
      const taken = draft.picks.map((p) => p.playerId);
      const candidates = await testDb.player.findMany({
        where: { id: { notIn: taken } }, orderBy: { defaultRank: "asc" },
      });
      // try candidates until one fits the on-clock roster
      let made = false;
      for (const c of candidates) {
        try {
          await makePick(testDb, { leagueId: league.id, userId: users[onClock], playerId: c.id });
          made = true;
          break;
        } catch (err) {
          if (err instanceof NoSlotForPositionError) continue;
          throw err;
        }
      }
      expect(made).toBe(true);
    }
    const final = await testDb.draft.findUniqueOrThrow({ where: { leagueId: league.id } });
    expect(final.status).toBe("COMPLETE");
    expect(final.currentDeadline).toBeNull();
    expect(await testDb.draftPick.count({ where: { draftId: final.id } })).toBe(18);
    // no picks after completion
    const extra = await createTestPlayer("RB");
    await expect(
      makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: extra.id }),
    ).rejects.toThrow(DraftNotActiveError);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- make-pick`.

- [ ] **Step 3: Implement the shared advance transaction**

Create `src/domain/draft/advance.ts`:

```ts
import { Prisma, type Draft, type PrismaClient } from "@prisma/client";
import type { LeagueSettings } from "../league-settings";
import { PickConflictError } from "../errors";
import { computePickDeadline } from "./pick-clock";
import { totalPicks, type DraftOrder } from "./snake-order";

export interface ApplyPickInput {
  draft: Draft;
  settings: LeagueSettings;
  order: DraftOrder;
  entryId: string;
  playerId: string;
  slotIndex: number;
  autodrafted: boolean;
}

/**
 * Records the current pick and advances the draft in one transaction.
 * Concurrency: the updateMany count guard + the (draftId, pickIndex) unique
 * constraint mean exactly one of two racing picks wins; the loser gets PickConflictError.
 */
export async function applyPickAndAdvance(db: PrismaClient, input: ApplyPickInput) {
  const { draft, settings, order } = input;
  const nextIndex = draft.currentPickIndex + 1;
  const complete = nextIndex >= totalPicks(order.length, settings.rosterSlots.length);
  const nextDeadline = complete
    ? null
    : computePickDeadline(new Date(), settings.pickClockHours, settings.overnightPause);

  try {
    return await db.$transaction(async (tx) => {
      const pick = await tx.draftPick.create({
        data: {
          draftId: draft.id,
          pickIndex: draft.currentPickIndex,
          entryId: input.entryId,
          playerId: input.playerId,
          slotIndex: input.slotIndex,
          autodrafted: input.autodrafted,
        },
      });
      const updated = await tx.draft.updateMany({
        where: { id: draft.id, currentPickIndex: draft.currentPickIndex, status: "ACTIVE" },
        data: {
          currentPickIndex: nextIndex,
          currentDeadline: nextDeadline,
          status: complete ? "COMPLETE" : "ACTIVE",
        },
      });
      if (updated.count !== 1) throw new PickConflictError();
      const fresh = await tx.draft.findUniqueOrThrow({ where: { id: draft.id } });
      return { pick, draft: fresh };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PickConflictError();
    }
    throw err;
  }
}
```

- [ ] **Step 4: Implement `makePick`**

Create `src/domain/draft/make-pick.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import {
  DraftNotActiveError,
  NoSlotForPositionError,
  NotYourTurnError,
  PlayerUnavailableError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";
import { applyPickAndAdvance } from "./advance";
import { assignSlot } from "./slot-assignment";
import { draftOrderSchema, entryIdForPick } from "./snake-order";

export interface MakePickInput {
  leagueId: string;
  userId: string;
  playerId: string;
}

export async function makePick(db: PrismaClient, input: MakePickInput) {
  const draft = await db.draft.findUnique({
    where: { leagueId: input.leagueId },
    include: { picks: true },
  });
  if (!draft || draft.status !== "ACTIVE") throw new DraftNotActiveError();

  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  const settings = parseLeagueSettings(league.settings);
  const order = draftOrderSchema.parse(draft.order);

  const onClockEntryId = entryIdForPick(order, draft.currentPickIndex);
  const onClockEntry = await db.entry.findUniqueOrThrow({
    where: { id: onClockEntryId },
    include: { membership: true },
  });
  if (onClockEntry.membership.userId !== input.userId) throw new NotYourTurnError();

  const player = await db.player.findUnique({ where: { id: input.playerId } });
  if (!player || player.season !== league.season) throw new PlayerUnavailableError();
  if (draft.picks.some((p) => p.playerId === player.id)) throw new PlayerUnavailableError();

  const filled = draft.picks
    .filter((p) => p.entryId === onClockEntryId)
    .map((p) => p.slotIndex);
  const slotIndex = assignSlot(settings.rosterSlots, filled, player.position);
  if (slotIndex === null) throw new NoSlotForPositionError(player.position);

  return applyPickAndAdvance(db, {
    draft, settings, order,
    entryId: onClockEntryId,
    playerId: player.id,
    slotIndex,
    autodrafted: false,
  });
}
```

- [ ] **Step 5: Run to verify PASS** — `npm test -- make-pick`, then full suite + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: makePick with turn/availability/slot validation and race-safe advance"
```

---

### Task 9: Autodraft service

**Files:**
- Create: `src/domain/draft/autodraft.ts`
- Test: `src/domain/draft/autodraft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/draft/autodraft.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createTestPlayer, createStandardPool,
} from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { joinLeague } from "../leagues/join-league";
import { startDraft } from "./start-draft";
import { makePick } from "./make-pick";
import { autodraftCurrentPick } from "./autodraft";

async function draftSetup() {
  const commish = await createTestUser("Commish");
  const friend = await createTestUser("Friend");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "CT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
  const entries = await testDb.entry.findMany({
    where: { leagueId: league.id }, orderBy: { createdAt: "asc" },
  });
  const order = entries.map((e) => e.id);
  await startDraft(testDb, { leagueId: league.id, userId: commish.id, order });
  return { commish, friend, league, entries, order };
}

describe("autodraftCurrentPick", () => {
  beforeEach(resetDb);

  it("takes the top valid queued player first", async () => {
    const { league, entries } = await draftSetup();
    const rb1 = await createTestPlayer("RB", { defaultRank: 1 });
    const wr = await createTestPlayer("WR", { defaultRank: 2 });
    await testDb.draftQueueItem.createMany({
      data: [
        { entryId: entries[0].id, playerId: wr.id, rank: 1 },
        { entryId: entries[0].id, playerId: rb1.id, rank: 2 },
      ],
    });
    const result = await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: 0 });
    expect(result!.pick.playerId).toBe(wr.id); // queue rank 1 beats better defaultRank
    expect(result!.pick.autodrafted).toBe(true);
  });

  it("skips queued players that are taken or don't fit, then falls back to defaultRank", async () => {
    const { commish, league, entries } = await draftSetup();
    const star = await createTestPlayer("RB", { defaultRank: 1 });
    const next = await createTestPlayer("WR", { defaultRank: 2 });
    // friend queued only the star; commish drafts the star at pick 0
    await testDb.draftQueueItem.create({
      data: { entryId: entries[1].id, playerId: star.id, rank: 1 },
    });
    await makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: star.id });
    const result = await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: 1 });
    expect(result!.pick.playerId).toBe(next.id); // queue exhausted → best defaultRank
    expect(result!.pick.entryId).toBe(entries[1].id);
  });

  it("is a no-op when the pick was already made (stale timer)", async () => {
    const { commish, league } = await draftSetup();
    const rb = await createTestPlayer("RB");
    await createTestPlayer("WR");
    await makePick(testDb, { leagueId: league.id, userId: commish.id, playerId: rb.id });
    const result = await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: 0 });
    expect(result).toBeNull();
    expect(await testDb.draftPick.count()).toBe(1);
  });

  it("can complete an entire draft unattended", async () => {
    const { league } = await draftSetup();
    await createStandardPool(2);
    for (let i = 0; i < 18; i++) {
      const r = await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
      expect(r).not.toBeNull();
    }
    const draft = await testDb.draft.findUniqueOrThrow({ where: { leagueId: league.id } });
    expect(draft.status).toBe("COMPLETE");
    // every entry ended with a legal full roster: 9 picks each, distinct slots
    const picks = await testDb.draftPick.findMany({ where: { draftId: draft.id } });
    const byEntry = new Map<string, number[]>();
    for (const p of picks) {
      byEntry.set(p.entryId, [...(byEntry.get(p.entryId) ?? []), p.slotIndex]);
    }
    for (const slots of byEntry.values()) {
      expect(slots).toHaveLength(9);
      expect(new Set(slots).size).toBe(9);
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- autodraft`.

- [ ] **Step 3: Implement**

Create `src/domain/draft/autodraft.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { PickConflictError } from "../errors";
import { parseLeagueSettings } from "../league-settings";
import { applyPickAndAdvance } from "./advance";
import { assignSlot } from "./slot-assignment";
import { draftOrderSchema, entryIdForPick } from "./snake-order";

export interface AutodraftInput {
  leagueId: string;
  /** The pick the timer was armed for. If the draft has moved on, this is a stale timer: no-op. */
  expectedPickIndex: number;
}

/**
 * Makes the current pick on behalf of the on-clock entry: top valid queued player,
 * else best defaultRank player that fits. Returns null when there is nothing to do
 * (pick already made, draft complete/missing) — safe to call from stale timers.
 */
export async function autodraftCurrentPick(db: PrismaClient, input: AutodraftInput) {
  const draft = await db.draft.findUnique({
    where: { leagueId: input.leagueId },
    include: { picks: true },
  });
  if (!draft || draft.status !== "ACTIVE") return null;
  if (draft.currentPickIndex !== input.expectedPickIndex) return null;

  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  const settings = parseLeagueSettings(league.settings);
  const order = draftOrderSchema.parse(draft.order);
  const entryId = entryIdForPick(order, draft.currentPickIndex);

  const taken = new Set(draft.picks.map((p) => p.playerId));
  const filled = draft.picks.filter((p) => p.entryId === entryId).map((p) => p.slotIndex);

  let chosen: { playerId: string; slotIndex: number } | null = null;

  const queue = await db.draftQueueItem.findMany({
    where: { entryId },
    orderBy: { rank: "asc" },
    include: { player: true },
  });
  for (const item of queue) {
    if (taken.has(item.playerId)) continue;
    const slotIndex = assignSlot(settings.rosterSlots, filled, item.player.position);
    if (slotIndex !== null) {
      chosen = { playerId: item.playerId, slotIndex };
      break;
    }
  }

  if (!chosen) {
    const candidates = await db.player.findMany({
      where: { season: league.season, id: { notIn: [...taken] } },
      orderBy: { defaultRank: "asc" },
    });
    for (const p of candidates) {
      const slotIndex = assignSlot(settings.rosterSlots, filled, p.position);
      if (slotIndex !== null) {
        chosen = { playerId: p.id, slotIndex };
        break;
      }
    }
  }

  if (!chosen) {
    // Pool exhausted for this roster shape — misconfigured league; surface loudly.
    throw new Error(`autodraft: no draftable player for entry ${entryId} in league ${league.id}`);
  }

  try {
    return await applyPickAndAdvance(db, {
      draft, settings, order, entryId,
      playerId: chosen.playerId,
      slotIndex: chosen.slotIndex,
      autodrafted: true,
    });
  } catch (err) {
    if (err instanceof PickConflictError) return null; // human pick landed first — fine
    throw err;
  }
}
```

- [ ] **Step 4: Run to verify PASS**, full suite, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: autodraft — queue first, defaultRank fallback, stale-timer safe"
```

---

### Task 10: Queue service

**Files:**
- Create: `src/domain/draft/queue.ts`
- Test: `src/domain/draft/queue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/domain/draft/queue.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createTestPlayer } from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { setQueue, getQueue } from "./queue";
import { PlayerUnavailableError } from "../errors";

async function setup() {
  const user = await createTestUser();
  const league = await createLeague(testDb, {
    userId: user.id, name: "L", teamName: "T",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const entry = await testDb.entry.findFirstOrThrow({ where: { leagueId: league.id } });
  return { user, league, entry };
}

describe("queue", () => {
  beforeEach(resetDb);

  it("replaces the queue in order and reads it back", async () => {
    const { user, league } = await setup();
    const a = await createTestPlayer("RB");
    const b = await createTestPlayer("WR");
    await setQueue(testDb, { leagueId: league.id, userId: user.id, playerIds: [b.id, a.id] });
    let queue = await getQueue(testDb, { leagueId: league.id, userId: user.id });
    expect(queue.map((q) => q.playerId)).toEqual([b.id, a.id]);

    await setQueue(testDb, { leagueId: league.id, userId: user.id, playerIds: [a.id] });
    queue = await getQueue(testDb, { leagueId: league.id, userId: user.id });
    expect(queue.map((q) => q.playerId)).toEqual([a.id]);
  });

  it("rejects players from another season and non-members", async () => {
    const { user, league } = await setup();
    const old = await createTestPlayer("RB", { season: 2025 });
    await expect(
      setQueue(testDb, { leagueId: league.id, userId: user.id, playerIds: [old.id] }),
    ).rejects.toThrow(PlayerUnavailableError);

    const outsider = await createTestUser("Outsider");
    const p = await createTestPlayer("RB");
    await expect(
      setQueue(testDb, { leagueId: league.id, userId: outsider.id, playerIds: [p.id] }),
    ).rejects.toThrow(/not a member/i);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- queue`.

- [ ] **Step 3: Implement**

Create `src/domain/draft/queue.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { PlayerUnavailableError } from "../errors";

async function entryForUser(db: PrismaClient, leagueId: string, userId: string) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });
  const entry = membership?.entries[0];
  if (!entry) throw new Error("not a member of this league");
  return entry;
}

export interface SetQueueInput {
  leagueId: string;
  userId: string;
  /** Full replacement, best first. Empty array clears the queue. */
  playerIds: string[];
}

export async function setQueue(db: PrismaClient, input: SetQueueInput) {
  const entry = await entryForUser(db, input.leagueId, input.userId);
  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });

  const unique = new Set(input.playerIds);
  if (unique.size !== input.playerIds.length) throw new PlayerUnavailableError();
  const players = await db.player.findMany({
    where: { id: { in: input.playerIds }, season: league.season },
  });
  if (players.length !== input.playerIds.length) throw new PlayerUnavailableError();

  return db.$transaction(async (tx) => {
    await tx.draftQueueItem.deleteMany({ where: { entryId: entry.id } });
    if (input.playerIds.length > 0) {
      await tx.draftQueueItem.createMany({
        data: input.playerIds.map((playerId, i) => ({
          entryId: entry.id,
          playerId,
          rank: i + 1,
        })),
      });
    }
  });
}

export async function getQueue(db: PrismaClient, input: { leagueId: string; userId: string }) {
  const entry = await entryForUser(db, input.leagueId, input.userId);
  return db.draftQueueItem.findMany({
    where: { entryId: entry.id },
    orderBy: { rank: "asc" },
    include: { player: true },
  });
}
```

- [ ] **Step 4: Run to verify PASS**, full suite, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: draft queue service (full-replace semantics)"
```

---

### Task 11: Email notifier

**Files:**
- Create: `src/lib/notify.ts`

No unit test (it's a thin I/O wrapper mirroring `src/lib/auth.ts`'s email pattern); exercised via the Inngest function and manual verification in Task 12.

- [ ] **Step 1: Implement**

Create `src/lib/notify.ts`:

```ts
import { Resend } from "resend";

// Channel abstraction: Phase 2 ships email only. Phase 2.5 adds SMS (Twilio) and
// Web Push behind this same function, dispatching on user notification preferences.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface Notification {
  subject: string;
  text: string;
}

/**
 * Best-effort user notification. Throws on send failure so callers running inside
 * Inngest steps get retries; callers on request paths must catch — notifications
 * never block a pick.
 */
export async function notifyUser(
  user: { email: string; name: string },
  notification: Notification,
): Promise<void> {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set; cannot send notifications");
    }
    console.log(`[dev] notify ${user.email}: ${notification.subject} — ${notification.text}`);
    return;
  }
  const { error } = await resend.emails.send({
    from:
      process.env.NOTIFY_FROM_EMAIL ??
      "Playoff Best Ball <notify@transactional.playoffbestball.com>",
    to: user.email,
    subject: notification.subject,
    text: notification.text,
  });
  if (error) {
    throw new Error(`notification email to ${user.email} failed: ${error.name}: ${error.message}`);
  }
}
```

Add to `.env.example` under the email section:

```
# Optional: override the notifications From address
NOTIFY_FROM_EMAIL=""
```

- [ ] **Step 2: Verify and commit**

`npx tsc --noEmit` clean.

```bash
git add -A
git commit -m "feat: email notifier (channel abstraction for Phase 2.5)"
```

---

### Task 12: Inngest — durable pick clocks and turn notifications

**Files:**
- Create: `src/lib/inngest.ts`, `src/lib/draft-events.ts`, `src/inngest/functions.ts`
- Create: `src/app/api/inngest/route.ts`
- Modify: `package.json` (dep), `.env.example`, `README.md` (dev workflow)

- [ ] **Step 1: Install and create the client**

```bash
npm install inngest
```

Create `src/lib/inngest.ts`:

```ts
import { Inngest } from "inngest";

// Durable timers for draft pick clocks. Local dev: `npx inngest-cli@latest dev`
// (the SDK auto-connects to the dev server); without it, event sends fail and are
// logged loudly — drafting still works, but autodraft timers and notifications don't fire.
export const inngest = new Inngest({ id: "playoff-best-ball" });
```

- [ ] **Step 2: Event emission helper**

Create `src/lib/draft-events.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { draftOrderSchema, entryIdForPick } from "@/domain/draft/snake-order";
import { inngest } from "./inngest";

/**
 * Announces the draft's current state to Inngest: arms the pick clock for the
 * on-clock turn, or emits completion. Failures are caught and logged — the pick
 * itself must never fail because eventing is down (dev without `inngest-cli dev`,
 * transient outage). A missed turn event means no autodraft timer for that turn,
 * which self-corrects on the next human pick.
 */
export async function announceDraftState(db: PrismaClient, leagueId: string): Promise<void> {
  try {
    const draft = await db.draft.findUnique({ where: { leagueId } });
    if (!draft) return;
    if (draft.status === "COMPLETE") {
      await inngest.send({
        name: "draft/completed",
        data: { leagueId, draftId: draft.id },
      });
      return;
    }
    const order = draftOrderSchema.parse(draft.order);
    await inngest.send({
      name: "draft/turn.started",
      data: {
        leagueId,
        draftId: draft.id,
        pickIndex: draft.currentPickIndex,
        entryId: entryIdForPick(order, draft.currentPickIndex),
        deadline: draft.currentDeadline!.toISOString(),
      },
    });
  } catch (err) {
    console.error(`[draft-events] failed to announce draft state for league ${leagueId}:`, err);
  }
}
```

- [ ] **Step 3: Inngest functions**

Create `src/inngest/functions.ts`:

```ts
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { notifyUser } from "@/lib/notify";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { announceDraftState } from "@/lib/draft-events";

/**
 * Pick clock: sleeps until the turn's deadline, then autodrafts if (and only if)
 * that pick is still open. autodraftCurrentPick is idempotent against stale timers.
 */
export const draftPickClock = inngest.createFunction(
  { id: "draft-pick-clock" },
  { event: "draft/turn.started" },
  async ({ event, step }) => {
    await step.sleepUntil("until-deadline", event.data.deadline);
    const result = await step.run("autodraft-if-still-open", () =>
      autodraftCurrentPick(db, {
        leagueId: event.data.leagueId,
        expectedPickIndex: event.data.pickIndex,
      }),
    );
    if (result) {
      // Autodraft advanced the draft; arm the next turn (or announce completion).
      await step.run("announce-next-turn", () =>
        announceDraftState(db, event.data.leagueId),
      );
    }
  },
);

/** "You're on the clock" email to the on-clock entry's owner. */
export const notifyOnTheClock = inngest.createFunction(
  { id: "draft-notify-on-the-clock" },
  { event: "draft/turn.started" },
  async ({ event, step }) => {
    await step.run("send", async () => {
      const entry = await db.entry.findUniqueOrThrow({
        where: { id: event.data.entryId },
        include: { membership: { include: { user: true } }, league: true },
      });
      const deadline = new Date(event.data.deadline);
      await notifyUser(entry.membership.user, {
        subject: `You're on the clock in ${entry.league.name}`,
        text: [
          `It's your pick in ${entry.league.name} (pick ${event.data.pickIndex + 1}).`,
          `Your clock runs out ${deadline.toLocaleString("en-US", { timeZone: "America/New_York" })} ET — after that we'll autodraft from your queue.`,
          `Make your pick: ${process.env.BETTER_AUTH_URL}/leagues/${event.data.leagueId}/draft`,
        ].join("\n\n"),
      });
    });
  },
);

/** Draft-complete email to every member. */
export const notifyDraftComplete = inngest.createFunction(
  { id: "draft-notify-complete" },
  { event: "draft/completed" },
  async ({ event, step }) => {
    await step.run("send-all", async () => {
      const memberships = await db.membership.findMany({
        where: { leagueId: event.data.leagueId },
        include: { user: true, league: true },
      });
      for (const m of memberships) {
        await notifyUser(m.user, {
          subject: `${m.league.name}: the draft is complete`,
          text: `All picks are in. See every roster: ${process.env.BETTER_AUTH_URL}/leagues/${event.data.leagueId}/draft`,
        });
      }
    });
  },
);

export const functions = [draftPickClock, notifyOnTheClock, notifyDraftComplete];
```

Create `src/app/api/inngest/route.ts`:

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { functions } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
```

**Adaptation note:** the Inngest SDK surface (`serve` import path, `sleepUntil` signature, event typing) may have drifted — adapt to the installed version's types with minimal changes and note them. Do not add event schemas/typed clients yet (YAGNI at 2 events).

- [ ] **Step 4: Env + docs**

Add to `.env.example`:

```
# Inngest (durable draft timers). Empty in dev — run `npx inngest-cli@latest dev` alongside
# `npm run dev` to exercise pick clocks locally. Set both in production (Vercel integration).
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""
```

Add to README's local-dev section: pick clocks and draft notifications require `npx inngest-cli@latest dev` running next to the dev server; without it drafting works but timers/emails don't fire (event sends log errors to the console).

- [ ] **Step 5: Manual verification**

Run `npm run dev` and `npx inngest-cli@latest dev` in parallel. Hit `curl -s http://localhost:3000/api/inngest | head -3` — expect Inngest introspection JSON (function count 3). Full timer behavior is exercised in Task 13's verification once routes exist.

- [ ] **Step 6: Quality gates + commit**

`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all clean.

```bash
git add -A
git commit -m "feat: inngest pick clocks and draft notifications"
```

---

### Task 13: Draft API routes

**Files:**
- Create: `src/app/api/leagues/[leagueId]/draft/route.ts` (GET state, POST start)
- Create: `src/app/api/leagues/[leagueId]/draft/pick/route.ts` (POST)
- Create: `src/app/api/leagues/[leagueId]/queue/route.ts` (GET, PUT)
- Create: `src/app/api/players/route.ts` (GET)
- Create: `src/lib/draft-state.ts` (shared state assembly for the GET route)

- [ ] **Step 1: Draft state assembly**

Create `src/lib/draft-state.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "@/domain/league-settings";
import { draftOrderSchema, entryIdForPick, totalPicks } from "@/domain/draft/snake-order";

/** Everything the draft room needs per poll. Small by design — the player pool is fetched separately and cached. */
export async function getDraftState(db: PrismaClient, leagueId: string, userId: string) {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      draft: {
        include: {
          picks: {
            orderBy: { pickIndex: "asc" },
            include: { player: { select: { name: true, position: true, nflTeam: true } } },
          },
        },
      },
      entries: {
        orderBy: { createdAt: "asc" },
        include: { membership: { include: { user: { select: { name: true } } } } },
      },
    },
  });

  const settings = parseLeagueSettings(league.settings);
  const myEntry = league.entries.find((e) => e.membership.userId === userId) ?? null;

  if (!league.draft) {
    return {
      status: "NOT_STARTED" as const,
      entries: league.entries.map((e) => ({
        entryId: e.id, name: e.name, ownerName: e.membership.user.name,
      })),
      rosterSlots: settings.rosterSlots,
      myEntryId: myEntry?.id ?? null,
    };
  }

  const order = draftOrderSchema.parse(league.draft.order);
  const entryById = new Map(league.entries.map((e) => [e.id, e]));

  return {
    status: league.draft.status,
    currentPickIndex: league.draft.currentPickIndex,
    deadline: league.draft.currentDeadline?.toISOString() ?? null,
    totalPicks: totalPicks(order.length, settings.rosterSlots.length),
    onClockEntryId:
      league.draft.status === "ACTIVE" ? entryIdForPick(order, league.draft.currentPickIndex) : null,
    order: order.map((entryId) => ({
      entryId,
      name: entryById.get(entryId)?.name ?? "?",
      ownerName: entryById.get(entryId)?.membership.user.name ?? "?",
    })),
    picks: league.draft.picks.map((p) => ({
      pickIndex: p.pickIndex,
      entryId: p.entryId,
      playerId: p.playerId,
      playerName: p.player.name,
      position: p.player.position,
      nflTeam: p.player.nflTeam,
      slotIndex: p.slotIndex,
      autodrafted: p.autodrafted,
    })),
    rosterSlots: settings.rosterSlots,
    myEntryId: myEntry?.id ?? null,
  };
}

export type DraftState = Awaited<ReturnType<typeof getDraftState>>;
```

- [ ] **Step 2: Draft route (GET state, POST start)**

Create `src/app/api/leagues/[leagueId]/draft/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getDraftState } from "@/lib/draft-state";
import { announceDraftState } from "@/lib/draft-events";
import { startDraft } from "@/domain/draft/start-draft";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

async function requireMember(leagueId: string) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { user, membership };
}

export async function GET(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const auth = await requireMember(leagueId);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await getDraftState(db, leagueId, auth.user.id));
}

export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const auth = await requireMember(leagueId);
  if ("error" in auth) return auth.error;

  try {
    await startDraft(db, { leagueId, userId: auth.user.id });
    await announceDraftState(db, leagueId); // arms the first pick clock + notification
    return NextResponse.json(await getDraftState(db, leagueId, auth.user.id), { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
```

- [ ] **Step 3: Pick route**

Create `src/app/api/leagues/[leagueId]/draft/pick/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getDraftState } from "@/lib/draft-state";
import { announceDraftState } from "@/lib/draft-events";
import { makePick } from "@/domain/draft/make-pick";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({ playerId: z.string().min(1) });

export async function POST(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await makePick(db, { leagueId, userId: user.id, playerId: parsed.data.playerId });
    await announceDraftState(db, leagueId); // next clock + notification (or completion)
    return NextResponse.json(await getDraftState(db, leagueId, user.id), { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      // NOT_YOUR_TURN / PLAYER_UNAVAILABLE / NO_SLOT_FOR_POSITION / PICK_CONFLICT / DRAFT_NOT_ACTIVE
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
```

(Non-member users fail inside `makePick` with `NotYourTurnError` — they can never own the on-clock entry — so a 409 rather than 404 for non-members is acceptable here; the GET route is the one that gates visibility.)

- [ ] **Step 4: Queue route**

Create `src/app/api/leagues/[leagueId]/queue/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getQueue, setQueue } from "@/domain/draft/queue";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const items = await getQueue(db, { leagueId, userId: user.id });
    return NextResponse.json({
      queue: items.map((q) => ({ playerId: q.playerId, rank: q.rank })),
    });
  } catch (err) {
    if (err instanceof Error && /not a member/i.test(err.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

const bodySchema = z.object({ playerIds: z.array(z.string()).max(50) });

export async function PUT(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await setQueue(db, { leagueId, userId: user.id, playerIds: parsed.data.playerIds });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (err instanceof Error && /not a member/i.test(err.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Players route**

Create `src/app/api/players/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { CURRENT_SEASON } from "@/domain/season";

/** The season's player pool. Static per season — clients fetch once per draft-room visit. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const players = await db.player.findMany({
    where: { season: CURRENT_SEASON },
    orderBy: { defaultRank: "asc" },
    select: { id: true, name: true, position: true, nflTeam: true, defaultRank: true },
  });
  return NextResponse.json({ players });
}
```

- [ ] **Step 6: Manual verification (curl + cookie jars, for real)**

Dev server + `inngest-cli dev` running; players seeded (`npm run db:seed:players`). Two signed-in cookie jars (magic-link flow), commissioner creates a league, friend joins:
- GET draft state → `{"status":"NOT_STARTED",...}` with both entries.
- Friend POST /draft → 403 NOT_COMMISSIONER. Commissioner POST /draft → 201, status ACTIVE, deadline set; **verify in the Inngest dev UI (http://localhost:8288) that `draft/turn.started` arrived and `draft-pick-clock` is sleeping**; dev console logs the on-the-clock notification.
- On-clock user POST pick with a real playerId → 201, pick recorded, next turn armed. Off-turn pick → 409 NOT_YOUR_TURN. Taken player → 409 PLAYER_UNAVAILABLE.
- PUT queue with 2 playerIds → ok; GET queue returns them in order.
- GET /api/players → seeded pool ordered by rank.

- [ ] **Step 7: Quality gates + commit**

`npm run lint && npm run typecheck && npm test && npm run build`.

```bash
git add -A
git commit -m "feat: draft API — start, state, pick, queue, player pool"
```

---

### Task 14: League page draft card

**Files:**
- Create: `src/components/draft-card.tsx`
- Modify: `src/app/leagues/[leagueId]/page.tsx`

- [ ] **Step 1: Draft card component**

Create `src/components/draft-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function DraftCard({
  leagueId,
  isCommissioner,
  draftStatus, // "NOT_STARTED" | "ACTIVE" | "COMPLETE"
  entryCount,
}: {
  leagueId: string;
  isCommissioner: boolean;
  draftStatus: "NOT_STARTED" | "ACTIVE" | "COMPLETE";
  entryCount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    if (!window.confirm(`Start the draft with ${entryCount} teams? The order will be randomized and no one else can join.`)) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft`, { method: "POST" });
      if (res.ok) {
        router.push(`/leagues/${leagueId}/draft`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  if (draftStatus === "NOT_STARTED") {
    return (
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">Draft</h2>
        <p className="mt-1 text-sm text-gray-600">
          {isCommissioner
            ? "Once everyone's in, start the draft. Members pick on their own time and get notified on their turn."
            : "The commissioner hasn't started the draft yet. You'll get an email when you're on the clock."}
        </p>
        {isCommissioner && (
          <button
            type="button"
            onClick={start}
            disabled={starting || entryCount < 2}
            className="mt-3 rounded-lg bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start draft"}
          </button>
        )}
        {entryCount < 2 && isCommissioner && (
          <p className="mt-2 text-sm text-gray-500">You need at least 2 teams to start.</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold">Draft</h2>
      <p className="mt-1 text-sm text-gray-600">
        {draftStatus === "ACTIVE" ? "The draft is live." : "The draft is complete."}
      </p>
      <Link
        href={`/leagues/${leagueId}/draft`}
        className="mt-3 inline-block rounded-lg bg-green-700 px-4 py-2 font-semibold text-white"
      >
        {draftStatus === "ACTIVE" ? "Go to draft room" : "View results"}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire into the league page**

In `src/app/leagues/[leagueId]/page.tsx`:
- Include the draft in the league query: add `draft: { select: { status: true } }` to the existing `findUniqueOrThrow` include.
- Replace the static "The draft opens once your league is set…" placeholder `<p>` with:

```tsx
<div className="mt-8">
  <DraftCard
    leagueId={league.id}
    isCommissioner={isCommissioner}
    draftStatus={league.draft?.status ?? "NOT_STARTED"}
    entryCount={league.entries.length}
  />
</div>
```

- Import `DraftCard`.

- [ ] **Step 3: Manual verification**

Dev server: league page shows the card; non-commissioner sees no Start button; commissioner with 1 entry sees a disabled button; with 2+ entries Start → confirm dialog → redirects to `/leagues/[id]/draft` (404 until Task 15 — expected).

- [ ] **Step 4: Quality gates + commit**

`npm run lint && npm run typecheck && npm test && npm run build`.

```bash
git add -A
git commit -m "feat: league page draft card with commissioner start flow"
```

---

### Task 15: Draft room — polling hook, board, countdown

**Files:**
- Create: `src/components/draft/use-draft-state.ts`
- Create: `src/components/draft/countdown.tsx`
- Create: `src/components/draft/draft-board.tsx`
- Create: `src/app/leagues/[leagueId]/draft/page.tsx`
- Create: `src/components/draft/draft-room.tsx` (container; player pool + queue land in Task 16)

- [ ] **Step 1: Polling hook**

Create `src/components/draft/use-draft-state.ts`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftState } from "@/lib/draft-state";

const POLL_MS = 4000;

/** Polls draft state while the draft is ACTIVE; refetch() forces an immediate update (after a pick). */
export function useDraftState(leagueId: string) {
  const [state, setState] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft`);
      if (!res.ok) {
        setError("Couldn't load the draft.");
        return;
      }
      setState(await res.json());
      setError(null);
    } catch {
      setError("Couldn't reach the server.");
    }
  }, [leagueId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (state?.status !== "ACTIVE") {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    if (!timer.current) {
      timer.current = setInterval(() => void refetch(), POLL_MS);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [state?.status, refetch]);

  return { state, error, refetch };
}
```

- [ ] **Step 2: Countdown**

Create `src/components/draft/countdown.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

function label(msLeft: number): string {
  if (msLeft <= 0) return "time expired";
  const totalMinutes = Math.floor(msLeft / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "under a minute";
}

/** Coarse countdown (minutes) — pick clocks are hours long; second-ticking is noise. */
export function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <span>{label(new Date(deadline).getTime() - now)}</span>;
}
```

- [ ] **Step 3: Board**

Create `src/components/draft/draft-board.tsx`:

```tsx
"use client";

import type { DraftState } from "@/lib/draft-state";

type ActiveState = Extract<DraftState, { status: "ACTIVE" | "COMPLETE" }>;

/** Grid: one column per entry (round-1 order), one row per round; snake fills right-to-left on odd rounds. */
export function DraftBoard({ state }: { state: ActiveState }) {
  const entryCount = state.order.length;
  const rounds = state.totalPicks / entryCount;
  const pickByIndex = new Map(state.picks.map((p) => [p.pickIndex, p]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left text-gray-500">Rd</th>
            {state.order.map((e) => (
              <th
                key={e.entryId}
                className={`p-2 text-left ${e.entryId === state.onClockEntryId ? "text-green-700" : ""}`}
              >
                {e.name}
                <div className="font-normal text-gray-500">{e.ownerName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, round) => (
            <tr key={round} className="border-t">
              <td className="p-2 text-gray-500">{round + 1}</td>
              {state.order.map((e, col) => {
                const withinRound = round % 2 === 0 ? col : entryCount - 1 - col;
                const pickIndex = round * entryCount + withinRound;
                const pick = pickByIndex.get(pickIndex);
                const isCurrent = state.status === "ACTIVE" && pickIndex === state.currentPickIndex;
                return (
                  <td key={e.entryId} className={`p-2 ${isCurrent ? "bg-green-50" : ""}`}>
                    {pick ? (
                      <div data-testid="board-pick">
                        <span className="font-medium">{pick.playerName}</span>
                        <span className="ml-1 text-gray-500">
                          {pick.position} · {pick.nflTeam}
                          {pick.autodrafted && " · auto"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-300">{isCurrent ? "on the clock" : `#${pickIndex + 1}`}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Room container and page**

Create `src/components/draft/draft-room.tsx` (Task 16 adds the pool/queue panels into this container — leave the marked slot):

```tsx
"use client";

import { useDraftState } from "./use-draft-state";
import { Countdown } from "./countdown";
import { DraftBoard } from "./draft-board";

export function DraftRoom({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const { state, error, refetch } = useDraftState(leagueId);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!state) return <p className="p-6 text-gray-500">Loading draft…</p>;
  if (state.status === "NOT_STARTED") {
    return <p className="p-6 text-gray-600">The draft hasn't started yet.</p>;
  }

  const onClock = state.order.find((e) => e.entryId === state.onClockEntryId);
  const myTurn = state.status === "ACTIVE" && state.onClockEntryId === state.myEntryId;

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="text-2xl font-bold">{leagueName} — Draft</h1>
      {state.status === "ACTIVE" && state.deadline && onClock && (
        <div
          className={`mt-3 rounded-lg p-3 ${myTurn ? "bg-green-700 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          {myTurn ? (
            <span className="font-semibold">
              You're on the clock — <Countdown deadline={state.deadline} /> left
            </span>
          ) : (
            <span>
              {onClock.name} ({onClock.ownerName}) is on the clock — <Countdown deadline={state.deadline} /> left
            </span>
          )}
        </div>
      )}
      {state.status === "COMPLETE" && (
        <p className="mt-3 rounded-lg bg-gray-100 p-3 text-gray-700">The draft is complete.</p>
      )}
      <div className="mt-6">
        <DraftBoard state={state} />
      </div>
      {/* Task 16 mounts <PickPanel state={state} leagueId={leagueId} onPicked={refetch} /> here */}
      {void refetch /* referenced so Task 15 compiles before Task 16 wires it */}
    </div>
  );
}
```

Create `src/app/leagues/[leagueId]/draft/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { DraftRoom } from "@/components/draft/draft-room";

export default async function DraftPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/draft`);

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });

  return (
    <>
      <AppNav userName={user.name} />
      <DraftRoom leagueId={leagueId} leagueName={league.name} />
    </>
  );
}
```

If the `{void refetch}` compile-bridge trips lint, use `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on a destructure instead — whatever is cleanest; it disappears in Task 16.

- [ ] **Step 5: Manual verification**

Two browsers, started draft: both see the board; on-clock user sees the green banner with countdown; picks made via curl (Task 13 flow) appear on both boards within ~4s without reload.

- [ ] **Step 6: Quality gates + commit**

`npm run lint && npm run typecheck && npm test && npm run build`.

```bash
git add -A
git commit -m "feat: draft room — polling state, snake board, countdown banner"
```

---

### Task 16: Draft room — player pool, pick action, queue panel

**Files:**
- Create: `src/components/draft/pick-panel.tsx`
- Modify: `src/components/draft/draft-room.tsx`

- [ ] **Step 1: Pick panel (pool + queue in one client component)**

Create `src/components/draft/pick-panel.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { DraftState } from "@/lib/draft-state";

type ActiveState = Extract<DraftState, { status: "ACTIVE" | "COMPLETE" }>;

interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  defaultRank: number;
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"] as const;

export function PickPanel({
  state,
  leagueId,
  onPicked,
}: {
  state: ActiveState;
  leagueId: string;
  onPicked: () => void;
}) {
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [queue, setQueue] = useState<string[]>([]); // playerIds, best first
  const [filter, setFilter] = useState<(typeof POSITIONS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const takenIds = useMemo(() => new Set(state.picks.map((p) => p.playerId)), [state.picks]);
  const myTurn = state.status === "ACTIVE" && state.onClockEntryId === state.myEntryId;
  const poolById = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);

  useEffect(() => {
    void (async () => {
      try {
        const [playersRes, queueRes] = await Promise.all([
          fetch("/api/players"),
          fetch(`/api/leagues/${leagueId}/queue`),
        ]);
        if (playersRes.ok) setPool((await playersRes.json()).players);
        if (queueRes.ok) {
          const body = await queueRes.json();
          setQueue(body.queue.map((q: { playerId: string }) => q.playerId));
        }
      } catch {
        setError("Couldn't load players.");
      }
    })();
  }, [leagueId]);

  async function saveQueue(next: string[]) {
    setQueue(next); // optimistic
    try {
      const res = await fetch(`/api/leagues/${leagueId}/queue`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerIds: next }),
      });
      if (!res.ok) setError("Couldn't save your queue.");
    } catch {
      setError("Couldn't save your queue.");
    }
  }

  async function draftPlayer(playerId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft/pick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Pick failed.");
      }
      onPicked(); // refetch either way — a PICK_CONFLICT means the board changed
    } catch {
      setError("Couldn't reach the server. Your pick was NOT made — try again.");
    } finally {
      setBusy(false);
    }
  }

  const visible = pool.filter(
    (p) =>
      !takenIds.has(p.id) &&
      (filter === "ALL" || p.position === filter) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function move(playerId: string, dir: -1 | 1) {
    const i = queue.indexOf(playerId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= queue.length) return;
    const next = [...queue];
    [next[i], next[j]] = [next[j], next[i]];
    void saveQueue(next);
  }

  if (state.status === "COMPLETE") return null;

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="font-semibold">Available players</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setFilter(pos)}
              className={`rounded px-2 py-1 text-sm ${filter === pos ? "bg-green-700 text-white" : "border"}`}
            >
              {pos}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="ml-auto rounded-lg border px-3 py-1 text-sm"
            aria-label="Search players"
          />
        </div>
        <ul className="mt-3 max-h-96 overflow-y-auto rounded-lg border">
          {visible.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b p-2 last:border-b-0">
              <span>
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-sm text-gray-500">{p.position} · {p.nflTeam}</span>
              </span>
              <span className="flex gap-2">
                {!queue.includes(p.id) && (
                  <button
                    type="button"
                    onClick={() => void saveQueue([...queue, p.id])}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    Queue
                  </button>
                )}
                <button
                  type="button"
                  disabled={!myTurn || busy}
                  onClick={() => void draftPlayer(p.id)}
                  className="rounded bg-green-700 px-2 py-1 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Draft
                </button>
              </span>
            </li>
          ))}
          {visible.length === 0 && <li className="p-3 text-sm text-gray-500">No players match.</li>}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">My queue</h2>
        <p className="mt-1 text-sm text-gray-500">
          If your clock runs out, we draft the highest available player from this list (skipping any
          that don't fit your roster), then best-available.
        </p>
        <ul className="mt-3 rounded-lg border">
          {queue.map((playerId, i) => {
            const p = poolById.get(playerId);
            if (!p) return null;
            return (
              <li key={playerId} className="flex items-center justify-between border-b p-2 last:border-b-0">
                <span className={takenIds.has(playerId) ? "text-gray-400 line-through" : ""}>
                  {i + 1}. {p.name}{" "}
                  <span className="text-sm text-gray-500">{p.position} · {p.nflTeam}</span>
                </span>
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move ${p.name} up`} onClick={() => move(playerId, -1)} className="rounded border px-2 py-1 text-sm">↑</button>
                  <button type="button" aria-label={`Move ${p.name} down`} onClick={() => move(playerId, 1)} className="rounded border px-2 py-1 text-sm">↓</button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name} from queue`}
                    onClick={() => void saveQueue(queue.filter((id) => id !== playerId))}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
          {queue.length === 0 && <li className="p-3 text-sm text-gray-500">Queue is empty.</li>}
        </ul>
      </section>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Mount in the room**

In `src/components/draft/draft-room.tsx`: remove the `{void refetch}` bridge and replace the Task-16 placeholder comment with:

```tsx
<PickPanel state={state} leagueId={leagueId} onPicked={() => void refetch()} />
```

Import `PickPanel`.

- [ ] **Step 3: Manual verification**

Two browsers through a real mini-draft: filter/search works; Draft button only enabled on your turn; making a pick updates both boards; queueing players persists across reload; drafted players show struck-through in the queue and disappear from the pool; letting a clock expire (temporarily set a league's `pickClockHours` — no: instead trigger the timer by curling the Inngest dev UI's replay, or simply verify the autodraft path via the Task 9 tests; timer-firing was verified in Task 13 Step 6).

- [ ] **Step 4: Quality gates + commit**

`npm run lint && npm run typecheck && npm test && npm run build`.

```bash
git add -A
git commit -m "feat: draft room pick panel — player pool, queue, pick action"
```

---

### Task 17: E2E — two users draft through the UI

**Files:**
- Create: `e2e/draft-happy-path.spec.ts`, `e2e/global-setup.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Global setup seeds the test-DB player pool**

Create `e2e/global-setup.ts` (constructs its own Prisma client — the Playwright process does not load `.env.test`):

```ts
import path from "node:path";
import { Pool } from "pg";
// match the import paths used in src/lib/db.ts:
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedPlayers } from "../prisma/seed-players";

export default async function globalSetup() {
  const pool = new Pool({ connectionString: "postgresql://pbb:pbb@localhost:5433/pbb_test" });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  await seedPlayers(db, path.join(__dirname, "..", "data", "players-2026.json"));
  await db.$disconnect();
  await pool.end();
}
```

In `playwright.config.ts` add at the top level of the config object:

```ts
globalSetup: "./e2e/global-setup.ts",
```

- [ ] **Step 2: Write the spec**

Create `e2e/draft-happy-path.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("commissioner starts draft, both users pick, board updates", async ({ browser }) => {
  const stamp = Date.now();
  const commishCtx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const commish = await commishCtx.newPage();
  await signUp(commish, "Commish", `draft-commish-${stamp}@example.com`);

  // League + invite (same flow as league-happy-path)
  await commish.goto("/leagues/new");
  await commish.getByPlaceholder("The Gerner Invitational").fill("Draft E2E League");
  await commish.getByPlaceholder("Team Nick").fill("Commish Team");
  await commish.getByRole("button", { name: "Create league" }).click();
  await expect(commish.getByRole("heading", { name: "Draft E2E League" })).toBeVisible();
  await commish.getByRole("button", { name: "Copy invite link" }).click();
  const inviteUrl: string = await commish.evaluate(() => navigator.clipboard.readText());

  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await signUp(friend, "Friend", `draft-friend-${stamp}@example.com`);
  await friend.goto(inviteUrl);
  await friend.getByPlaceholder("Your team name").fill("Friend Team");
  await friend.getByRole("button", { name: "Join league" }).click();
  await expect(friend.getByText("Commish Team")).toBeVisible();

  // Start the draft (confirm dialog)
  commish.on("dialog", (d) => void d.accept());
  await commish.getByRole("button", { name: "Start draft" }).click();
  await expect(commish.getByRole("heading", { name: /Draft$/ })).toBeVisible();

  // Whoever is on the clock picks the top available player; do 3 picks alternating by banner.
  const pages: Record<string, Page> = { commish, friend };
  for (let i = 0; i < 3; i++) {
    // Determine who's on the clock from the commissioner's view
    await commish.reload();
    const myTurnCommish = await commish
      .getByText("You're on the clock")
      .isVisible()
      .catch(() => false);
    const picker = myTurnCommish ? pages.commish : pages.friend;
    if (!myTurnCommish) await friend.goto(commish.url());
    const firstDraftButton = picker.getByRole("button", { name: "Draft", exact: true }).first();
    await expect(firstDraftButton).toBeEnabled();
    await firstDraftButton.click();
    // the pick lands on the board (filled-cell count grows past i)
    await expect.poll(() => picker.getByTestId("board-pick").count()).toBeGreaterThan(i);
  }

  await commishCtx.close();
  await friendCtx.close();
});
```

**Selector note:** the assertion counts `data-testid="board-pick"` cells, which Task 15's `draft-board.tsx` renders on every filled pick. If any other selector doesn't match the real rendered DOM while implementing, adjust the selector, not the flow — the turn-alternation logic (checking the banner) is the part that matters.

- [ ] **Step 3: Run**

```bash
npm run test:e2e
```

Expected: 2 passed (league + draft specs). Debug with `--headed` if selectors need adjusting.

- [ ] **Step 4: Quality gates + commit**

Full sweep: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`.

```bash
git add -A
git commit -m "test: e2e draft — start, alternating picks, live board"
```

---

### Task 18: Docs wrap-up

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README updates**

- Local setup: add `npm run db:seed:players` after `npm run db:push`; add the optional `npx inngest-cli@latest dev` step with one sentence on what it enables (pick clocks + notification timers).
- Project structure: add `src/domain/draft/` (draft engine: snake order, slot assignment, pick clock, services), `src/inngest/` (durable functions), `data/` (player pool fixtures).
- Testing: note `npm run test:e2e` seeds players automatically via Playwright global setup.

- [ ] **Step 2: Final verification sweep**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

All green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: README updates for the draft engine"
```

---

## Deferred (explicit)

- **Phase 2.5 (next plan):** Twilio SMS channel + phone collection UI ("text me when I'm on the clock"), Web Push + PWA manifest/service worker, notification preferences per user, scheduled draft start
- **Phase 3:** real playoff player pool via StatsProvider/ESPN (replaces the fixture), projections replacing `defaultRank` as autodraft fallback, scoring/leaderboard
- **Known accepted risks:** pick-clock timers depend on Inngest availability (missed timer self-corrects on next human pick; monitoring lands in Phase 5); `updateMany` optimistic guard is the concurrency backstop and is DB-constraint-backed via the three DraftPick uniques
