# Phase 3: Season Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live playoff scoring — real ESPN stats flow into raw stat lines, every league computes fantasy points from its own settings, best-ball optimal lineups roll up into a leaderboard, and `legacy/` gets deleted.

**Architecture:** All stat ingestion goes through a `StatsProvider` interface (spec's load-bearing rule: ESPN is fetched once per sync cycle into our DB; every league view computes from our DB). Raw stats are stored ONCE per player-week as validated JSON (`StatLine`); fantasy points are computed per league at read time by a pure scoring engine ported from the prototype. A pure best-ball optimizer fills each league's roster shape. Inngest crons drive game-window-aware syncs. `FakeStatsProvider` powers tests, a mock-week dev script, and the December beta.

**Tech Stack:** Existing stack; no new runtime deps. The prototype's battle-tested ESPN parsing (`legacy/src/lib/espn/`) and scoring rules (`legacy/src/lib/scoring/`) are PORT SOURCES — read them, port them, then Task 16 deletes `legacy/` entirely.

**Spec:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md` (§4 stack rule, §5 PlayerStat, §6 season engine, §7 admin/reliability)

**Boundaries (YAGNI):** No projections/odds/props/weather (Phase 4 premium analytics). No substitutions scoring (Phase 4 — the league setting exists but stays off). No recap notifications (Phase 4). Sync-failure Slack alerting is Phase 5 — this phase logs loudly and shows sync state in admin. Score caching: computed at read (leagues are small); add caching only if Phase 5 load tests demand it.

---

## Conventions (read these files first)

- Domain: `src/domain/**`, PrismaClient first arg, typed `DomainError`s with codes. Settings JSON pattern to mirror: `src/domain/league-settings.ts` (zod schema + parse/tryParse seam).
- Week mapping: `src/domain/season.ts` — `PLAYOFF_WEEKS = { WILD_CARD: 1, DIVISIONAL: 2, CONFERENCE: 3, SUPER_BOWL: 4 }`, `CURRENT_SEASON = 2026`. **ESPN uses seasontype=3 with weeks 1, 2, 3, 5 (4 = Pro Bowl, skipped). The adapter owns this translation; nothing else ever sees ESPN week numbers.**
- Inngest: `src/inngest/functions.ts` (v4: `createFunction({id, triggers:{event|cron}}, handler)`), `src/lib/draft-events.ts` patterns.
- Tests: Vitest vs Postgres 5433, `tests/helpers/db.ts`, TDD. Current suite: 75 vitest + 4 e2e — keep green.
- Slot/optimizer building blocks: `src/domain/draft/slot-assignment.ts` (`FLEX_ELIGIBLE`), `RosterSlotDef` from league-settings.

---

### Task 1: Schema — NflGame + PlayerStat

**Files:**
- Modify: `prisma/schema.prisma`, `tests/helpers/db.ts`

- [ ] **Step 1: Models.** Append to `prisma/schema.prisma`:

```prisma
enum GameState {
  SCHEDULED
  IN_PROGRESS
  FINAL
}

model NflGame {
  id        String    @id @default(cuid())
  season    Int
  week      Int // OUR playoff week (1=WC..4=SB) — never ESPN's
  eventId   String    @unique // ESPN event id
  homeTeam  String
  awayTeam  String
  startsAt  DateTime
  state     GameState @default(SCHEDULED)
  homeScore Int       @default(0)
  awayScore Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([season, week])
  @@index([state])
}

model PlayerStat {
  id        String   @id @default(cuid())
  // Restrict: stats are scoring history; deleting a player must never erase it.
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Restrict)
  playerId  String
  season    Int
  week      Int // OUR playoff week
  stats     Json // StatLine (see src/domain/stats/stat-line.ts)
  eventId   String? // game correlation, when known
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([playerId, season, week])
  @@index([season, week])
}
```

Add back-relation `stats PlayerStat[]` on `Player`.

- [ ] **Step 2: Push + generate.** `npm run db:push && npm run db:push:test && npx prisma generate`

- [ ] **Step 3: Helpers.** In `tests/helpers/db.ts` `resetDb`, add `await testDb.playerStat.deleteMany();` and `await testDb.nflGame.deleteMany();` BEFORE the player delete (PlayerStat restricts player deletion). Only `resetDb` changes in this task — the `setTestStat` factory lands in Task 2 (it imports Task 2's module).

- [ ] **Step 4: Verify + commit.** `npm test` (75) + tsc + lint.

```bash
git add -A && git commit -m "feat: schema for nfl games and raw player stat lines"
```

---

### Task 2: StatLine schema + test factory

**Files:**
- Create: `src/domain/stats/stat-line.ts`
- Test: `src/domain/stats/stat-line.test.ts`
- Modify: `tests/helpers/db.ts`

- [ ] **Step 1: Failing test** — create `src/domain/stats/stat-line.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyStatLine, parseStatLine, tryParseStatLine } from "./stat-line";

describe("stat-line", () => {
  it("empty line has zeroed stats, empty FG arrays, null pointsAllowed", () => {
    const line = emptyStatLine();
    expect(line.passYards).toBe(0);
    expect(line.fgMade).toEqual([]);
    expect(line.pointsAllowed).toBeNull();
  });

  it("parse fills defaults for missing fields (partial JSON from older syncs)", () => {
    const line = parseStatLine({ passYards: 312, passTd: 3 });
    expect(line.passYards).toBe(312);
    expect(line.rushYards).toBe(0);
    expect(line.fgMissed).toEqual([]);
  });

  it("rejects non-finite garbage", () => {
    expect(tryParseStatLine({ passYards: Infinity })).toBeNull();
    expect(tryParseStatLine("nope")).toBeNull();
  });

  it("allows negative yardage (sacks, kneel-downs) but round-trips cleanly", () => {
    const line = parseStatLine({ rushYards: -3 });
    expect(line.rushYards).toBe(-3);
    expect(parseStatLine(JSON.parse(JSON.stringify(line)))).toEqual(line);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/stats/stat-line.ts`:

```ts
import { z } from "zod";

// One raw stat line per player per playoff week, stored ONCE in PlayerStat.stats.
// Fantasy points are computed per league from this + the league's ScoringSettings.
// Field names deliberately match the prototype's PlayerStats (see the port in
// src/domain/scoring/compute-points.ts) so the ESPN parser port maps 1:1.

const n = z.number().finite().default(0);

export const statLineSchema = z.object({
  // passing
  passYards: n,
  passTd: n,
  passInt: n,
  // rushing
  rushYards: n,
  rushTd: n,
  // receiving
  recYards: n,
  recTd: n,
  receptions: n,
  // kicking — distances in yards, one entry per attempt
  fgMade: z.array(z.number().finite()).default([]),
  fgMissed: z.array(z.number().finite()).default([]),
  xpMade: n,
  xpMissed: n,
  // defense/special teams (DST pseudo-players)
  sacks: n,
  defInterceptions: n,
  fumblesRecovered: n,
  defensiveTd: n,
  safeties: n,
  blockedKicks: n,
  /** Opponent points scored against the DST; null for non-DST players. */
  pointsAllowed: z.number().finite().nullable().default(null),
  // misc
  twoPtConv: n,
  fumblesLost: n,
  returnTd: n,
});

export type StatLine = z.infer<typeof statLineSchema>;

export function emptyStatLine(): StatLine {
  return statLineSchema.parse({});
}

/** Single entry point for reading PlayerStat.stats JSON. */
export function parseStatLine(json: unknown): StatLine {
  return statLineSchema.parse(json);
}

/** safeParse variant for surfaces that must degrade gracefully. */
export function tryParseStatLine(json: unknown): StatLine | null {
  const result = statLineSchema.safeParse(json);
  return result.success ? result.data : null;
}
```

- [ ] **Step 3: PASS.**

- [ ] **Step 4: Add the DB factory.** In `tests/helpers/db.ts` append (with the imports at the top of the file):

```ts
import { emptyStatLine, type StatLine } from "@/domain/stats/stat-line";

/** Upserts a stat line for a player-week; partial overrides merge over an empty line. */
export async function setTestStat(
  playerId: string,
  week: number,
  overrides: Partial<StatLine>,
  season = CURRENT_SEASON,
) {
  const stats = { ...emptyStatLine(), ...overrides };
  return testDb.playerStat.upsert({
    where: { playerId_season_week: { playerId, season, week } },
    create: { playerId, season, week, stats },
    update: { stats },
  });
}
```

- [ ] **Step 5: Gates + commit.** `npm test` (79) + tsc + lint.

```bash
git add -A && git commit -m "feat: StatLine schema — the once-stored raw stat shape"
```

---

### Task 3: Scoring engine (port from legacy)

**Files:**
- Create: `src/domain/scoring/compute-points.ts`
- Test: `src/domain/scoring/compute-points.test.ts`
- Read first: `legacy/src/lib/scoring/calculator.ts`, `legacy/src/lib/scoring/rules.ts`

- [ ] **Step 1: Failing test** — create `src/domain/scoring/compute-points.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePoints, roundPoints } from "./compute-points";
import { SCORING_PRESETS } from "../league-settings";
import { emptyStatLine, type StatLine } from "../stats/stat-line";

const half = SCORING_PRESETS.half_ppr;

function line(overrides: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...overrides };
}

describe("computePoints", () => {
  it("scores a QB line (30yd/pt pass, 6/TD, -2/INT, 10yd/pt rush)", () => {
    const b = computePoints(line({ passYards: 300, passTd: 3, passInt: 1, rushYards: 20 }), half);
    expect(b.passing).toBeCloseTo(300 / 30 + 3 * 6 - 2); // 26
    expect(b.rushing).toBeCloseTo(2);
    expect(b.total).toBeCloseTo(28);
  });

  it("scores a WR line with half PPR", () => {
    const b = computePoints(line({ recYards: 110, recTd: 1, receptions: 8 }), half);
    expect(b.receiving).toBeCloseTo(11 + 6 + 4); // 21
  });

  it("full PPR differs only by reception value", () => {
    const stats = line({ receptions: 10 });
    expect(computePoints(stats, SCORING_PRESETS.full_ppr).total).toBeCloseTo(10);
    expect(computePoints(stats, SCORING_PRESETS.standard).total).toBeCloseTo(0);
  });

  it("scores kicking by distance bucket, with misses", () => {
    const b = computePoints(
      line({ fgMade: [19, 29, 39, 49, 55], fgMissed: [40], xpMade: 3, xpMissed: 1 }),
      half,
    );
    // 3 + 3 + 3 + 4 + 5 - 1 + 3*1 - 1 = 19
    expect(b.kicking).toBeCloseTo(19);
  });

  it("scores DST including every points-allowed bucket boundary", () => {
    const base = line({ sacks: 3, defInterceptions: 2, fumblesRecovered: 1, defensiveTd: 1, safeties: 1, blockedKicks: 1 });
    // 3 + 4 + 2 + 6 + 4 + 2 = 21 before PA
    const paCases: [number, number][] = [
      [0, 10], [1, 7], [6, 7], [7, 4], [13, 4], [14, 1], [20, 1],
      [21, 0], [27, 0], [28, -1], [34, -1], [35, -3], [50, -3],
    ];
    for (const [pa, pts] of paCases) {
      const b = computePoints({ ...base, pointsAllowed: pa }, half);
      expect(b.defense).toBeCloseTo(21 + pts);
    }
    // null pointsAllowed (non-DST) adds nothing
    expect(computePoints(base, half).defense).toBeCloseTo(21);
  });

  it("scores misc (2pt, fumbles lost, return TD)", () => {
    const b = computePoints(line({ twoPtConv: 1, fumblesLost: 2, returnTd: 1 }), half);
    expect(b.misc).toBeCloseTo(2 - 4 + 6);
  });

  it("roundPoints rounds to 2 decimals", () => {
    expect(roundPoints(10.005)).toBeCloseTo(10.01);
    expect(roundPoints(1 / 3)).toBe(0.33);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/scoring/compute-points.ts` (this is the prototype's `calculatePoints` ported onto our `StatLine` + `ScoringSettings` types — compare against `legacy/src/lib/scoring/calculator.ts` + `rules.ts` while writing):

```ts
import type { ScoringSettings } from "../league-settings";
import type { StatLine } from "../stats/stat-line";

export interface ScoreBreakdown {
  passing: number;
  rushing: number;
  receiving: number;
  kicking: number;
  defense: number;
  misc: number;
  total: number;
}

function fieldGoalPoints(distance: number, made: boolean, s: ScoringSettings): number {
  if (!made) return s.fgMiss;
  if (distance <= 19) return s.fg0_19;
  if (distance <= 29) return s.fg20_29;
  if (distance <= 39) return s.fg30_39;
  if (distance <= 49) return s.fg40_49;
  return s.fg50Plus;
}

function pointsAllowedScore(pointsAllowed: number, s: ScoringSettings): number {
  if (pointsAllowed === 0) return s.pa0;
  if (pointsAllowed <= 6) return s.pa1_6;
  if (pointsAllowed <= 13) return s.pa7_13;
  if (pointsAllowed <= 20) return s.pa14_20;
  if (pointsAllowed <= 27) return s.pa21_27;
  if (pointsAllowed <= 34) return s.pa28_34;
  return s.pa35Plus;
}

/** Pure fantasy-point computation: one raw stat line × one league's scoring settings. */
export function computePoints(stats: StatLine, s: ScoringSettings): ScoreBreakdown {
  const passing =
    stats.passYards / s.passYardsPerPoint + stats.passTd * s.passTd + stats.passInt * s.passInt;
  const rushing = stats.rushYards / s.rushYardsPerPoint + stats.rushTd * s.rushTd;
  const receiving =
    stats.recYards / s.recYardsPerPoint + stats.recTd * s.recTd + stats.receptions * s.ppr;

  let kicking = stats.xpMade * s.xpMade + stats.xpMissed * s.xpMiss;
  for (const d of stats.fgMade) kicking += fieldGoalPoints(d, true, s);
  for (const d of stats.fgMissed) kicking += fieldGoalPoints(d, false, s);

  let defense =
    stats.sacks * s.sack +
    stats.defInterceptions * s.defInt +
    stats.fumblesRecovered * s.fumRec +
    stats.defensiveTd * s.dstTd +
    stats.safeties * s.safety +
    stats.blockedKicks * s.block;
  if (stats.pointsAllowed !== null) defense += pointsAllowedScore(stats.pointsAllowed, s);

  const misc =
    stats.twoPtConv * s.twoPtConv + stats.fumblesLost * s.fumbleLost + stats.returnTd * s.returnTd;

  const total = passing + rushing + receiving + kicking + defense + misc;
  return { passing, rushing, receiving, kicking, defense, misc, total };
}

export function roundPoints(points: number): number {
  return Math.round((points + Number.EPSILON) * 100) / 100;
}
```

- [ ] **Step 3: PASS** (should be 86 total). Gates + commit.

```bash
git add -A && git commit -m "feat: scoring engine ported from the prototype"
```

---

### Task 4: Best-ball optimizer

**Files:**
- Create: `src/domain/scoring/best-ball.ts`
- Test: `src/domain/scoring/best-ball.test.ts`
- Read first: `legacy/src/lib/scoring/best-ball.ts` (reference), `src/domain/draft/slot-assignment.ts`

- [ ] **Step 1: Failing test** — create `src/domain/scoring/best-ball.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { optimalLineup } from "./best-ball";
import { DEFAULT_ROSTER_SLOTS } from "../league-settings";

// DEFAULT_ROSTER_SLOTS: [QB, RB, RB, WR, WR, TE, FLEX, K, DST]

const p = (playerId: string, position: string, points: number) =>
  ({ playerId, position, points }) as { playerId: string; position: "QB" | "RB" | "WR" | "TE" | "K" | "DST"; points: number };

describe("optimalLineup", () => {
  it("fills direct slots with the best at each position, FLEX with best leftover", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [
      p("qb1", "QB", 20), p("qb2", "QB", 25),
      p("rb1", "RB", 15), p("rb2", "RB", 12), p("rb3", "RB", 9),
      p("wr1", "WR", 14), p("wr2", "WR", 11), p("wr3", "WR", 10),
      p("te1", "TE", 8),
      p("k1", "K", 7), p("dst1", "DST", 6),
    ]);
    const byIndex = new Map(result.slots.map((s) => [s.slotIndex, s.playerId]));
    expect(byIndex.get(0)).toBe("qb2"); // best QB
    expect([byIndex.get(1), byIndex.get(2)].sort()).toEqual(["rb1", "rb2"]);
    expect(byIndex.get(6)).toBe("wr3"); // FLEX: wr3(10) beats rb3(9)
    expect(result.total).toBeCloseTo(25 + 15 + 12 + 14 + 11 + 8 + 10 + 7 + 6);
  });

  it("leaves slots empty (null, 0 pts) when the position is missing", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [p("rb1", "RB", 10)]);
    const filled = result.slots.filter((s) => s.playerId !== null);
    expect(filled).toHaveLength(1);
    expect(result.total).toBeCloseTo(10);
  });

  it("never uses a player twice (second-best RB stays out of FLEX if used in RB2)", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [
      p("rb1", "RB", 20), p("rb2", "RB", 18), p("rb3", "RB", 16),
    ]);
    const used = result.slots.filter((s) => s.playerId).map((s) => s.playerId);
    expect(new Set(used).size).toBe(used.length);
    expect(used).toHaveLength(3); // RB, RB, FLEX
    expect(result.total).toBeCloseTo(54);
  });

  it("QB/K/DST never flex", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [
      p("qb1", "QB", 30), p("qb2", "QB", 29), p("k1", "K", 28), p("k2", "K", 27),
    ]);
    const flexSlot = result.slots[6];
    expect(flexSlot.playerId).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/scoring/best-ball.ts`:

```ts
import type { PlayerPosition } from "@prisma/client";
import type { RosterSlotDef } from "../league-settings";
import { FLEX_ELIGIBLE } from "../draft/slot-assignment";

export interface ScoredPlayer {
  playerId: string;
  position: PlayerPosition;
  points: number;
}

export interface LineupSlot {
  slotIndex: number;
  playerId: string | null;
  points: number;
}

/**
 * Best-ball optimal lineup: direct slots take the best remaining player of their
 * position, then FLEX slots take the best remaining FLEX-eligible player.
 * This greedy fill is exactly optimal when FLEX eligibility is a superset of the
 * direct slot positions (true for every v1 roster shape); revisit if slot types
 * with overlapping partial eligibility (e.g. superflex) arrive.
 */
export function optimalLineup(
  rosterSlots: readonly RosterSlotDef[],
  players: readonly ScoredPlayer[],
): { slots: LineupSlot[]; total: number } {
  const remaining = [...players].sort((a, b) => b.points - a.points);
  const slots: LineupSlot[] = rosterSlots.map((_, i) => ({ slotIndex: i, playerId: null, points: 0 }));

  const takeBest = (eligible: (p: ScoredPlayer) => boolean): ScoredPlayer | null => {
    const idx = remaining.findIndex(eligible);
    return idx === -1 ? null : remaining.splice(idx, 1)[0];
  };

  rosterSlots.forEach((slot, i) => {
    if (slot.slot === "FLEX") return;
    const best = takeBest((c) => c.position === slot.slot);
    if (best) slots[i] = { slotIndex: i, playerId: best.playerId, points: best.points };
  });
  rosterSlots.forEach((slot, i) => {
    if (slot.slot !== "FLEX") return;
    const best = takeBest((c) => FLEX_ELIGIBLE.includes(c.position));
    if (best) slots[i] = { slotIndex: i, playerId: best.playerId, points: best.points };
  });

  const total = slots.reduce((sum, s) => sum + s.points, 0);
  return { slots, total };
}
```

- [ ] **Step 3: PASS** (90 total). Gates + commit.

```bash
git add -A && git commit -m "feat: best-ball optimal lineup"
```

---

### Task 5: StatsProvider interface + FakeStatsProvider

**Files:**
- Create: `src/domain/stats/provider.ts`, `src/domain/stats/fake-provider.ts`
- Test: `src/domain/stats/fake-provider.test.ts`

- [ ] **Step 1: Interface** — create `src/domain/stats/provider.ts`:

```ts
import type { PlayerPosition } from "@prisma/client";
import type { StatLine } from "./stat-line";

export type ProviderGameState = "SCHEDULED" | "IN_PROGRESS" | "FINAL";

export interface ProviderGame {
  eventId: string;
  week: number; // OUR playoff week (1..4)
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
  state: ProviderGameState;
  homeScore: number;
  awayScore: number;
}

export interface ProviderPlayerStats {
  externalId: string;
  name: string;
  position: PlayerPosition | null; // null when the source doesn't say (matched by externalId instead)
  nflTeam: string;
  stats: StatLine;
}

export interface ProviderPoolPlayer {
  externalId: string;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
}

/**
 * The spec's escape hatch: all stat ingestion goes through this seam.
 * ESPN is the v1 adapter; a licensed feed is a new implementation, not a rewrite.
 */
export interface StatsProvider {
  fetchWeekGames(season: number, week: number): Promise<ProviderGame[]>;
  fetchGameStats(eventId: string): Promise<ProviderPlayerStats[]>;
  fetchTeamRoster(season: number, team: string): Promise<ProviderPoolPlayer[]>;
}
```

- [ ] **Step 2: Failing test** — create `src/domain/stats/fake-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FakeStatsProvider } from "./fake-provider";
import { emptyStatLine } from "./stat-line";

describe("FakeStatsProvider", () => {
  const fake = new FakeStatsProvider({
    games: [
      {
        eventId: "g1", week: 1, homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date("2027-01-09T18:00:00Z"), state: "FINAL", homeScore: 27, awayScore: 20,
      },
    ],
    stats: {
      g1: [
        {
          externalId: "e-mahomes", name: "Patrick Mahomes", position: "QB", nflTeam: "KC",
          stats: { ...emptyStatLine(), passYards: 300, passTd: 3 },
        },
      ],
    },
    rosters: {
      KC: [{ externalId: "e-mahomes", name: "Patrick Mahomes", position: "QB", nflTeam: "KC" }],
    },
  });

  it("serves configured games, stats, and rosters", async () => {
    expect(await fake.fetchWeekGames(2026, 1)).toHaveLength(1);
    expect(await fake.fetchWeekGames(2026, 2)).toHaveLength(0);
    expect((await fake.fetchGameStats("g1"))[0].stats.passYards).toBe(300);
    expect(await fake.fetchGameStats("unknown")).toEqual([]);
    expect(await fake.fetchTeamRoster(2026, "KC")).toHaveLength(1);
    expect(await fake.fetchTeamRoster(2026, "NE")).toEqual([]);
  });
});
```

- [ ] **Step 3: FAIL**, then implement — create `src/domain/stats/fake-provider.ts`:

```ts
import type {
  ProviderGame,
  ProviderPlayerStats,
  ProviderPoolPlayer,
  StatsProvider,
} from "./provider";

export interface FakeStatsData {
  games: ProviderGame[];
  /** eventId → stat lines */
  stats: Record<string, ProviderPlayerStats[]>;
  /** team abbreviation → roster */
  rosters: Record<string, ProviderPoolPlayer[]>;
}

/**
 * Deterministic in-memory provider: drives unit/integration tests, the
 * `mock:week` dev script, and the December beta's simulated playoffs.
 */
export class FakeStatsProvider implements StatsProvider {
  constructor(private readonly data: FakeStatsData) {}

  async fetchWeekGames(_season: number, week: number): Promise<ProviderGame[]> {
    return this.data.games.filter((g) => g.week === week);
  }

  async fetchGameStats(eventId: string): Promise<ProviderPlayerStats[]> {
    return this.data.stats[eventId] ?? [];
  }

  async fetchTeamRoster(_season: number, team: string): Promise<ProviderPoolPlayer[]> {
    return this.data.rosters[team] ?? [];
  }
}
```

- [ ] **Step 4: PASS** (91). Gates + commit.

```bash
git add -A && git commit -m "feat: StatsProvider seam and deterministic fake"
```

---

### Task 6: ESPN adapter (port from legacy)

**Files:**
- Create: `src/lib/stats/espn-provider.ts`, `src/lib/stats/espn-parse.ts`
- Create: `tests/fixtures/espn-scoreboard.json`, `tests/fixtures/espn-summary.json`
- Test: `src/lib/stats/espn-parse.test.ts`
- Read first: `legacy/src/lib/espn/client.ts`, `legacy/src/lib/espn/parser.ts`, `legacy/src/lib/espn/types.ts` — **this is a PORT. The legacy parser is battle-tested against real playoff data; keep its parsing decisions unless they conflict with the StatLine shape.**

- [ ] **Step 1: Capture fixtures.** Fetch real ESPN responses and commit trimmed versions (keep 1–2 games / a handful of athletes per category — enough to exercise every parse path incl. a kicker with FG distances and both DSTs):

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&week=1&dates=2026" > /tmp/sb.json
# pick an eventId from it:
curl -s "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<EVENT_ID>" > /tmp/summary.json
```

(January 2026 playoff data exists — `dates=2026` selects last season. If the dates param misbehaves, omit it and use whatever completed playoff week ESPN returns; the fixture just needs real structure.) Trim in an editor/jq to keep files <150KB each; preserve: scoreboard `events[].competitions[].competitors` + `status.type.state` + `date`; summary `boxscore.players[].statistics[]` for all categories, `scoringPlays` (FG distances come from scoring plays if the boxscore lacks them — check what legacy/parser.ts uses and keep its source of truth), and `header` fields the parser needs.

- [ ] **Step 2: Failing parse tests** — create `src/lib/stats/espn-parse.test.ts`. Because fixture content varies, write assertions against INVARIANTS plus a few concrete values you verify by eye in the fixture:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseScoreboard, parseGameStats } from "./espn-parse";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../../../tests/fixtures", name), "utf8"));

describe("parseScoreboard", () => {
  it("maps events to ProviderGames with our week number and a valid state", () => {
    const games = parseScoreboard(fixture("espn-scoreboard.json"), 1);
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      expect(g.week).toBe(1);
      expect(g.eventId).toBeTruthy();
      expect(["SCHEDULED", "IN_PROGRESS", "FINAL"]).toContain(g.state);
      expect(g.homeTeam).not.toBe(g.awayTeam);
      expect(g.startsAt.getTime()).toBeGreaterThan(0);
    }
  });
});

describe("parseGameStats", () => {
  const lines = parseGameStats(fixture("espn-summary.json"));

  it("produces stat lines for skill players with sane values", () => {
    expect(lines.length).toBeGreaterThan(10);
    const qb = lines.find((l) => l.stats.passYards > 100);
    expect(qb).toBeDefined();
    expect(qb!.externalId).toBeTruthy();
  });

  it("produces exactly two DST lines with pointsAllowed set", () => {
    const dsts = lines.filter((l) => l.stats.pointsAllowed !== null);
    expect(dsts).toHaveLength(2);
    for (const dst of dsts) expect(dst.position).toBe("DST");
  });

  it("kicker FG distances land in fgMade/fgMissed arrays", () => {
    const kickers = lines.filter((l) => l.stats.fgMade.length + l.stats.fgMissed.length > 0);
    for (const k of kickers) {
      for (const d of [...k.stats.fgMade, ...k.stats.fgMissed]) {
        expect(d).toBeGreaterThan(9);
        expect(d).toBeLessThan(80);
      }
    }
  });

  it("every line round-trips the StatLine schema", () => {
    for (const l of lines) {
      expect(() => JSON.parse(JSON.stringify(l.stats))).not.toThrow();
    }
  });
});
```

ADD 2-4 concrete-value assertions against your actual fixture (e.g. the real QB's exact passYards) once captured — pin real numbers, note the game in a comment.

- [ ] **Step 3: Implement the parser** — create `src/lib/stats/espn-parse.ts` by PORTING `legacy/src/lib/espn/parser.ts` onto the new types:

```ts
import type { ProviderGame, ProviderPlayerStats } from "@/domain/stats/provider";
import { emptyStatLine, type StatLine } from "@/domain/stats/stat-line";

// Ported from legacy/src/lib/espn/parser.ts — keep its parsing decisions.
// ESPN types are declared inline and minimally: we only touch what we parse.

export function parseScoreboard(scoreboard: unknown, ourWeek: number): ProviderGame[] { /* ported body — see PORT INSTRUCTIONS */ }

export function parseGameStats(summary: unknown): ProviderPlayerStats[] { /* ported body — see PORT INSTRUCTIONS */ }
```

**PORT INSTRUCTIONS (the function bodies ARE this task — read `legacy/src/lib/espn/parser.ts` end-to-end first and port its logic faithfully; the fixture tests pin the behavior):**

1. `parseScoreboard`: map `events[]` → `{ eventId: event.id, week: ourWeek, homeTeam/awayTeam from competitions[0].competitors (the entry with homeAway === "home"/"away", team.abbreviation), startsAt: new Date(event.date), state: status.type.state "pre"|"in"|"post" → SCHEDULED|IN_PROGRESS|FINAL, homeScore/awayScore: Number(competitor.score ?? 0) }`. Filter out any event whose name includes "pro bowl" (defensive — the adapter also never requests ESPN week 4).
2. `parseGameStats`: walk `boxscore.players[team].statistics[category].athletes`, accumulating ONE StatLine per athlete across categories (an athlete appears in both passing AND rushing). Column meanings come from each category's `labels`/`keys` arrays — port legacy's column mapping exactly.
3. FG distances: legacy sources these from wherever the boxscore lacks them (likely `scoringPlays` text or the kicking category's long/made strings) — find legacy's source of truth and keep it.
4. DST lines: synthesize exactly two per game (one per team) from team-level defensive stats plus `pointsAllowed` = the OPPOSING team's final score — legacy solved where to read this (summary header/competitions); keep its approach. Use `dst-{TEAM}` as the DST externalId convention and `{Team Name} D/ST` naming (matching the seed fixture style) unless legacy has a better convention — note what you chose.
5. Declare minimal inline types for the ESPN shapes you actually touch (port/trim from `legacy/src/lib/espn/types.ts`); do not port unused type surface.

- [ ] **Step 4: Adapter shell** — create `src/lib/stats/espn-provider.ts`:

```ts
import type { StatsProvider, ProviderGame, ProviderPlayerStats, ProviderPoolPlayer } from "@/domain/stats/provider";
import { parseScoreboard, parseGameStats } from "./espn-parse";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

// OUR playoff weeks 1..4 ↔ ESPN seasontype=3 weeks 1,2,3,5 (ESPN week 4 = Pro Bowl).
const ESPN_WEEK: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5 };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

export class EspnStatsProvider implements StatsProvider {
  async fetchWeekGames(_season: number, week: number): Promise<ProviderGame[]> {
    const espnWeek = ESPN_WEEK[week];
    if (!espnWeek) throw new Error(`invalid playoff week ${week}`);
    const data = await getJson(`${BASE}/scoreboard?seasontype=3&week=${espnWeek}`);
    return parseScoreboard(data, week);
  }

  async fetchGameStats(eventId: string): Promise<ProviderPlayerStats[]> {
    const data = await getJson(`${BASE}/summary?event=${eventId}`);
    return parseGameStats(data);
  }

  async fetchTeamRoster(_season: number, team: string): Promise<ProviderPoolPlayer[]> {
    const data = await getJson(`${BASE}/teams/${team.toLowerCase()}/roster`);
    return parseRoster(data, team); // add parseRoster to espn-parse.ts: athletes[] groups → {externalId: athlete.id, name: displayName, position: mapped or skip, nflTeam: team}; skip positions outside QB/RB/WR/TE/K; append the synthetic DST pool player { externalId: `dst-${team}`, name: `${TeamName} D/ST`, position: "DST", nflTeam: team }.
  }
}

export const espnProvider = new EspnStatsProvider();
```

Write `parseRoster` fully in espn-parse.ts (with a fixture `tests/fixtures/espn-roster.json` captured the same way + 1-2 tests: skill positions present, non-fantasy positions skipped, DST appended).

- [ ] **Step 5: Live smoke (manual, not a test).** `npx tsx -e "import('./src/lib/stats/espn-provider').then(async m => console.log((await m.espnProvider.fetchWeekGames(2025, 1)).slice(0,2)))"` — real request, eyeball sane output. Note: season param unused by ESPN scoreboard (returns current/most-recent); that's acceptable — the sync layer controls WHICH season rows it writes.

- [ ] **Step 6: Gates + commit.** `npm test` (fixture tests green), tsc, lint, build.

```bash
git add -A && git commit -m "feat: ESPN stats adapter ported from the prototype with fixture tests"
```

---

### Task 7: Player pool sync

**Files:**
- Create: `src/domain/stats/sync-pool.ts`
- Test: `src/domain/stats/sync-pool.test.ts`

- [ ] **Step 1: Failing test** — create `src/domain/stats/sync-pool.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestPlayer } from "../../../tests/helpers/db";
import { syncPlayerPool } from "./sync-pool";
import { FakeStatsProvider } from "./fake-provider";
import { CURRENT_SEASON } from "../season";

const provider = new FakeStatsProvider({
  games: [],
  stats: {},
  rosters: {
    KC: [
      { externalId: "e1", name: "Patrick Mahomes", position: "QB", nflTeam: "KC" },
      { externalId: "e2", name: "Rashee Rice", position: "WR", nflTeam: "KC" },
    ],
    BUF: [{ externalId: "e3", name: "Josh Allen", position: "QB", nflTeam: "BUF" }],
  },
});

describe("syncPlayerPool", () => {
  beforeEach(resetDb);

  it("creates players with externalIds and appended default ranks", async () => {
    const result = await syncPlayerPool(testDb, provider, {
      season: CURRENT_SEASON, teams: ["KC", "BUF"],
    });
    expect(result.created).toBe(3);
    const players = await testDb.player.findMany({ orderBy: { defaultRank: "asc" } });
    expect(players).toHaveLength(3);
    expect(new Set(players.map((p) => p.defaultRank)).size).toBe(3); // unique ranks
    expect(players.every((p) => p.externalId)).toBe(true);
  });

  it("matches existing players by (season,name,position) and backfills externalId", async () => {
    const existing = await createTestPlayer("QB", { name: "Patrick Mahomes", defaultRank: 1 });
    const result = await syncPlayerPool(testDb, provider, {
      season: CURRENT_SEASON, teams: ["KC"],
    });
    expect(result.created).toBe(1); // only Rice is new
    expect(result.updated).toBe(1);
    const mahomes = await testDb.player.findUniqueOrThrow({ where: { id: existing.id } });
    expect(mahomes.externalId).toBe("e1");
    expect(mahomes.defaultRank).toBe(1); // rank preserved
  });

  it("is idempotent", async () => {
    await syncPlayerPool(testDb, provider, { season: CURRENT_SEASON, teams: ["KC", "BUF"] });
    const again = await syncPlayerPool(testDb, provider, { season: CURRENT_SEASON, teams: ["KC", "BUF"] });
    expect(again.created).toBe(0);
    expect(await testDb.player.count()).toBe(3);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/stats/sync-pool.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { StatsProvider } from "./provider";

export interface SyncPoolInput {
  season: number;
  /** Playoff team abbreviations (admin-provided after Week 18). */
  teams: string[];
}

/**
 * Upserts the playoff player pool from provider rosters. Never deletes
 * (DraftPick/PlayerStat restrict player deletion anyway). Existing players are
 * matched by externalId first, then by (season, name, position) — which backfills
 * externalIds onto hand-seeded fixture players. New players get ranks appended
 * after the current max so hand-curated ranks survive.
 */
export async function syncPlayerPool(db: PrismaClient, provider: StatsProvider, input: SyncPoolInput) {
  let created = 0;
  let updated = 0;
  const maxRank = await db.player.aggregate({
    where: { season: input.season },
    _max: { defaultRank: true },
  });
  let nextRank = (maxRank._max.defaultRank ?? 0) + 1;

  for (const team of input.teams) {
    const roster = await provider.fetchTeamRoster(input.season, team);
    for (const p of roster) {
      const existing =
        (await db.player.findFirst({ where: { season: input.season, externalId: p.externalId } })) ??
        (await db.player.findUnique({
          where: { season_name_position: { season: input.season, name: p.name, position: p.position } },
        }));
      if (existing) {
        await db.player.update({
          where: { id: existing.id },
          data: { externalId: p.externalId, nflTeam: p.nflTeam },
        });
        updated += 1;
      } else {
        await db.player.create({
          data: {
            season: input.season,
            name: p.name,
            position: p.position,
            nflTeam: p.nflTeam,
            externalId: p.externalId,
            defaultRank: nextRank++,
          },
        });
        created += 1;
      }
    }
  }
  return { created, updated };
}
```

- [ ] **Step 3: PASS.** Gates + commit.

```bash
git add -A && git commit -m "feat: player pool sync with externalId backfill"
```

---

### Task 8: Week stats sync

**Files:**
- Create: `src/domain/stats/sync-week.ts`
- Test: `src/domain/stats/sync-week.test.ts`

- [ ] **Step 1: Failing test** — create `src/domain/stats/sync-week.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestPlayer } from "../../../tests/helpers/db";
import { syncWeekStats } from "./sync-week";
import { FakeStatsProvider } from "./fake-provider";
import { emptyStatLine, parseStatLine } from "./stat-line";
import { CURRENT_SEASON } from "../season";

function makeProvider(passYards: number, state: "FINAL" | "IN_PROGRESS" | "SCHEDULED" = "FINAL") {
  return new FakeStatsProvider({
    games: [
      {
        eventId: "g1", week: 1, homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date("2027-01-09T18:00:00Z"), state, homeScore: 27, awayScore: 20,
      },
    ],
    stats: {
      g1: [
        {
          externalId: "e1", name: "Patrick Mahomes", position: "QB", nflTeam: "KC",
          stats: { ...emptyStatLine(), passYards },
        },
        {
          externalId: "e-unknown", name: "Practice Squad Guy", position: "RB", nflTeam: "KC",
          stats: { ...emptyStatLine(), rushYards: 5 },
        },
      ],
    },
    rosters: {},
  });
}

describe("syncWeekStats", () => {
  beforeEach(resetDb);

  it("upserts games and stat lines matched by externalId, reporting unmatched", async () => {
    const mahomes = await createTestPlayer("QB", { name: "Patrick Mahomes" });
    await testDb.player.update({ where: { id: mahomes.id }, data: { externalId: "e1" } });

    const result = await syncWeekStats(testDb, makeProvider(300), { season: CURRENT_SEASON, week: 1 });
    expect(result.games).toBe(1);
    expect(result.statLines).toBe(1);
    expect(result.unmatched).toEqual(["Practice Squad Guy (e-unknown)"]);

    const game = await testDb.nflGame.findUniqueOrThrow({ where: { eventId: "g1" } });
    expect(game.state).toBe("FINAL");
    const stat = await testDb.playerStat.findUniqueOrThrow({
      where: { playerId_season_week: { playerId: mahomes.id, season: CURRENT_SEASON, week: 1 } },
    });
    expect(parseStatLine(stat.stats).passYards).toBe(300);
  });

  it("re-sync updates in place (idempotent, live-game progression)", async () => {
    const mahomes = await createTestPlayer("QB", { name: "Patrick Mahomes" });
    await testDb.player.update({ where: { id: mahomes.id }, data: { externalId: "e1" } });

    await syncWeekStats(testDb, makeProvider(150, "IN_PROGRESS"), { season: CURRENT_SEASON, week: 1 });
    await syncWeekStats(testDb, makeProvider(300, "FINAL"), { season: CURRENT_SEASON, week: 1 });

    expect(await testDb.playerStat.count()).toBe(1);
    const stat = await testDb.playerStat.findFirstOrThrow();
    expect(parseStatLine(stat.stats).passYards).toBe(300);
    expect((await testDb.nflGame.findUniqueOrThrow({ where: { eventId: "g1" } })).state).toBe("FINAL");
  });

  it("does not fetch stats for games that haven't started", async () => {
    const result = await syncWeekStats(testDb, makeProvider(0, "SCHEDULED"), {
      season: CURRENT_SEASON, week: 1,
    });
    expect(result.games).toBe(1);
    expect(result.statLines).toBe(0);
    expect(await testDb.playerStat.count()).toBe(0);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/stats/sync-week.ts`:

```ts
import { Prisma, type PrismaClient } from "@prisma/client";
import type { StatsProvider } from "./provider";

export interface SyncWeekInput {
  season: number;
  week: number;
}

export interface SyncWeekResult {
  games: number;
  statLines: number;
  /** "Name (externalId)" for stat lines whose player isn't in the pool — admin fixes via pool sync. */
  unmatched: string[];
}

/** Idempotent: upserts NflGame rows and PlayerStat lines for one playoff week. */
export async function syncWeekStats(
  db: PrismaClient,
  provider: StatsProvider,
  input: SyncWeekInput,
): Promise<SyncWeekResult> {
  const games = await provider.fetchWeekGames(input.season, input.week);
  const unmatched: string[] = [];
  let statLines = 0;

  for (const g of games) {
    await db.nflGame.upsert({
      where: { eventId: g.eventId },
      create: {
        season: input.season, week: input.week, eventId: g.eventId,
        homeTeam: g.homeTeam, awayTeam: g.awayTeam, startsAt: g.startsAt,
        state: g.state, homeScore: g.homeScore, awayScore: g.awayScore,
      },
      update: {
        startsAt: g.startsAt, state: g.state,
        homeScore: g.homeScore, awayScore: g.awayScore,
      },
    });
  }

  for (const g of games) {
    if (g.state === "SCHEDULED") continue;
    const lines = await provider.fetchGameStats(g.eventId);
    for (const line of lines) {
      const player = await db.player.findFirst({
        where: { season: input.season, externalId: line.externalId },
      });
      if (!player) {
        unmatched.push(`${line.name} (${line.externalId})`);
        continue;
      }
      await db.playerStat.upsert({
        where: {
          playerId_season_week: { playerId: player.id, season: input.season, week: input.week },
        },
        create: {
          playerId: player.id, season: input.season, week: input.week,
          stats: line.stats as Prisma.InputJsonValue, eventId: g.eventId,
        },
        update: { stats: line.stats as Prisma.InputJsonValue, eventId: g.eventId },
      });
      statLines += 1;
    }
  }

  if (unmatched.length > 0) {
    console.warn(
      `[sync-week] ${unmatched.length} unmatched stat lines for season ${input.season} week ${input.week}: ${unmatched.join(", ")}`,
    );
  }
  return { games: games.length, statLines, unmatched };
}
```

Note: a player appearing in two games in one week is impossible in the playoffs; the per-week unique holds.

- [ ] **Step 3: PASS.** Gates + commit.

```bash
git add -A && git commit -m "feat: idempotent week stats sync with unmatched reporting"
```

---

### Task 9: League scores read layer

**Files:**
- Create: `src/lib/league-scores.ts`
- Test: `src/domain/scoring/league-scores.test.ts` — wait, it needs db + is a lib; keep the test at `tests/league-scores.test.ts` (matches the vitest include glob `tests/**/*.test.ts`)

- [ ] **Step 1: Failing test** — create `tests/league-scores.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createTestPlayer, createStandardPool, setTestStat,
} from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { getLeagueScores } from "@/lib/league-scores";
import { PLAYOFF_WEEKS } from "@/domain/season";

describe("getLeagueScores", () => {
  beforeEach(resetDb);

  it("computes weekly optimal lineups and a sorted leaderboard", async () => {
    const commish = await createTestUser("Commish");
    const friend = await createTestUser("Friend");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "CT",
      scoringPreset: "half_ppr", pickClockHours: 8,
    });
    await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
    await createStandardPool(2);
    const entries = await testDb.entry.findMany({ where: { leagueId: league.id }, orderBy: { createdAt: "asc" } });
    await startDraft(testDb, {
      leagueId: league.id, userId: commish.id, order: entries.map((e) => e.id),
    });
    for (let i = 0; i < 18; i++) {
      await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
    }

    // Give every drafted player 10 points-ish of stats in week 1; give one of
    // entry-2's players a monster game so entry 2 leads.
    const picks = await testDb.draftPick.findMany({ include: { player: true } });
    for (const pick of picks) {
      await setTestStat(pick.playerId, PLAYOFF_WEEKS.WILD_CARD, { rushYards: 100 }); // 10 pts
    }
    const entry2Pick = picks.find((p) => p.entryId === entries[1].id && p.player.position === "RB")!;
    await setTestStat(entry2Pick.playerId, PLAYOFF_WEEKS.WILD_CARD, { rushYards: 300, rushTd: 3 }); // 48

    const scores = await getLeagueScores(testDb, league.id);
    expect(scores.entries).toHaveLength(2);
    expect(scores.entries[0].entryId).toBe(entries[1].id); // leader first
    expect(scores.entries[0].grandTotal).toBeGreaterThan(scores.entries[1].grandTotal);

    const week1 = scores.entries[0].weeks.find((w) => w.week === PLAYOFF_WEEKS.WILD_CARD)!;
    expect(week1.total).toBeCloseTo(week1.lineup.reduce((s, slot) => s + slot.points, 0));
    // 9 slots, all filled (every drafted player has stats)
    expect(week1.lineup.filter((s) => s.playerId !== null)).toHaveLength(9);
    // a week with no stats contributes zero
    const week3 = scores.entries[0].weeks.find((w) => w.week === PLAYOFF_WEEKS.CONFERENCE)!;
    expect(week3.total).toBe(0);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/lib/league-scores.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "@/domain/league-settings";
import { computePoints, roundPoints } from "@/domain/scoring/compute-points";
import { optimalLineup, type ScoredPlayer } from "@/domain/scoring/best-ball";
import { tryParseStatLine } from "@/domain/stats/stat-line";
import { PLAYOFF_WEEKS } from "@/domain/season";

const ALL_WEEKS = Object.values(PLAYOFF_WEEKS);

export interface EntryWeekScore {
  week: number;
  total: number;
  lineup: {
    slotIndex: number;
    slotLabel: string;
    playerId: string | null;
    playerName: string | null;
    position: string | null;
    points: number;
  }[];
  /** Drafted players who scored but didn't make the optimal lineup. */
  bench: { playerId: string; playerName: string; position: string; points: number }[];
}

export interface LeagueScores {
  weeks: number[];
  entries: {
    entryId: string;
    name: string;
    ownerName: string;
    weeks: EntryWeekScore[];
    grandTotal: number;
  }[];
}

/** Leaderboard + weekly optimal lineups, computed at read from raw stats × league scoring. */
export async function getLeagueScores(db: PrismaClient, leagueId: string): Promise<LeagueScores> {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: {
          membership: { include: { user: { select: { name: true } } } },
          picks: { include: { player: { select: { id: true, name: true, position: true } } } },
        },
      },
    },
  });
  const settings = parseLeagueSettings(league.settings);

  // One stats read for the whole league: every drafted player's lines, all weeks.
  const draftedPlayerIds = [...new Set(league.entries.flatMap((e) => e.picks.map((p) => p.playerId)))];
  const statRows = await db.playerStat.findMany({
    where: { season: league.season, playerId: { in: draftedPlayerIds } },
  });
  const pointsByPlayerWeek = new Map<string, number>();
  for (const row of statRows) {
    const line = tryParseStatLine(row.stats);
    if (!line) continue; // corrupt row: skip rather than 500 a leaderboard
    pointsByPlayerWeek.set(
      `${row.playerId}:${row.week}`,
      roundPoints(computePoints(line, settings.scoring).total),
    );
  }

  const entries = league.entries.map((entry) => {
    const weeks: EntryWeekScore[] = ALL_WEEKS.map((week) => {
      const scored: ScoredPlayer[] = entry.picks.map((pick) => ({
        playerId: pick.playerId,
        position: pick.player.position,
        points: pointsByPlayerWeek.get(`${pick.playerId}:${week}`) ?? 0,
      }));
      const { slots, total } = optimalLineup(settings.rosterSlots, scored);
      const usedIds = new Set(slots.map((s) => s.playerId).filter(Boolean));
      const playerById = new Map(entry.picks.map((p) => [p.playerId, p.player]));
      return {
        week,
        total: roundPoints(total),
        lineup: slots.map((s) => ({
          slotIndex: s.slotIndex,
          slotLabel: settings.rosterSlots[s.slotIndex].slot,
          playerId: s.playerId,
          playerName: s.playerId ? (playerById.get(s.playerId)?.name ?? null) : null,
          position: s.playerId ? (playerById.get(s.playerId)?.position ?? null) : null,
          points: s.points,
        })),
        bench: scored
          .filter((p) => !usedIds.has(p.playerId) && p.points > 0)
          .map((p) => ({
            playerId: p.playerId,
            playerName: playerById.get(p.playerId)?.name ?? "?",
            position: playerById.get(p.playerId)?.position ?? "?",
            points: p.points,
          })),
      };
    });
    return {
      entryId: entry.id,
      name: entry.name,
      ownerName: entry.membership.user.name,
      weeks,
      grandTotal: roundPoints(weeks.reduce((sum, w) => sum + w.total, 0)),
    };
  });

  entries.sort((a, b) => b.grandTotal - a.grandTotal);
  return { weeks: ALL_WEEKS, entries };
}
```

- [ ] **Step 3: PASS.** Gates + commit.

```bash
git add -A && git commit -m "feat: league scores — per-week optimal lineups and leaderboard"
```

---

### Task 10: Inngest sync crons

**Files:**
- Modify: `src/inngest/functions.ts`
- Modify: `.env.example` (nothing new needed — note only)

- [ ] **Step 1: Add two cron functions.** In `src/inngest/functions.ts` (merge imports; register both in the `functions` array):

```ts
import { espnProvider } from "@/lib/stats/espn-provider";
import { syncWeekStats } from "@/domain/stats/sync-week";
import { CURRENT_SEASON, PLAYOFF_WEEKS } from "@/domain/season";

/**
 * Live sync: every 2 minutes, but only does work while a game is (or should be)
 * underway — cost stays flat when nothing is happening.
 */
export const statsSyncLive = inngest.createFunction(
  { id: "stats-sync-live", triggers: { cron: "*/2 * * * *" } },
  async ({ step }) => {
    const activeWeeks = await step.run("find-active-weeks", async () => {
      const games = await db.nflGame.findMany({
        where: {
          season: CURRENT_SEASON,
          OR: [
            { state: "IN_PROGRESS" },
            { state: "SCHEDULED", startsAt: { lte: new Date() } },
          ],
        },
        select: { week: true },
      });
      return [...new Set(games.map((g) => g.week))];
    });
    if (activeWeeks.length === 0) return { skipped: true };
    for (const week of activeWeeks) {
      await step.run(`sync-week-${week}`, () =>
        syncWeekStats(db, espnProvider, { season: CURRENT_SEASON, week }),
      );
    }
    return { skipped: false, weeks: activeWeeks };
  },
);

/** Daily full sync: refreshes schedules/state for every playoff week (6am ET). */
export const statsSyncDaily = inngest.createFunction(
  { id: "stats-sync-daily", triggers: { cron: "TZ=America/New_York 0 6 * * *" } },
  async ({ step }) => {
    for (const week of Object.values(PLAYOFF_WEEKS)) {
      await step.run(`sync-week-${week}`, () =>
        syncWeekStats(db, espnProvider, { season: CURRENT_SEASON, week }),
      );
    }
  },
);
```

(v4 cron trigger syntax: verify `triggers: { cron: "..." }` against the installed SDK — adapt minimally and report. The TZ= prefix is Inngest's documented timezone syntax.)

**Bootstrapping note (document in the admin task):** the live cron only wakes for games already in the DB — the daily cron (or an admin manual sync) seeds them. That's the intended flow: schedules land days ahead of kickoff.

- [ ] **Step 2: Verify.** Gates; dev server + `curl -s localhost:3000/api/inngest` → function_count 6.

- [ ] **Step 3: Commit.**

```bash
git add -A && git commit -m "feat: game-window-aware stats sync crons"
```

---

### Task 11: Leaderboard on the league page

**Files:**
- Create: `src/components/leaderboard.tsx`
- Modify: `src/app/leagues/[leagueId]/page.tsx`

- [ ] **Step 1: Component** — create `src/components/leaderboard.tsx` (server component — no "use client"):

```tsx
import Link from "next/link";
import type { LeagueScores } from "@/lib/league-scores";

const WEEK_LABELS: Record<number, string> = { 1: "WC", 2: "DIV", 3: "CONF", 4: "SB" };

export function Leaderboard({ leagueId, scores }: { leagueId: string; scores: LeagueScores }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="p-2">#</th>
            <th className="p-2">Team</th>
            {scores.weeks.map((w) => (
              <th key={w} className="p-2 text-right">{WEEK_LABELS[w] ?? w}</th>
            ))}
            <th className="p-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {scores.entries.map((entry, i) => (
            <tr key={entry.entryId} className="border-b last:border-b-0">
              <td className="p-2 text-gray-500">{i + 1}</td>
              <td className="p-2">
                <Link href={`/leagues/${leagueId}/entries/${entry.entryId}`} className="font-medium hover:underline">
                  {entry.name}
                </Link>
                <span className="ml-2 text-gray-500">{entry.ownerName}</span>
              </td>
              {entry.weeks.map((w) => (
                <td key={w.week} className="p-2 text-right tabular-nums">
                  {w.total > 0 ? w.total.toFixed(2) : "—"}
                </td>
              ))}
              <td className="p-2 text-right font-semibold tabular-nums">{entry.grandTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire the league page.** In `src/app/leagues/[leagueId]/page.tsx` (read it): when `league.draft?.status === "COMPLETE"`, fetch `getLeagueScores(db, leagueId)` and render a "Standings" section (`<h2 className="mb-3 font-semibold">Standings</h2>` + `<Leaderboard …/>`) ABOVE the existing Teams list. Leave the pre-draft/mid-draft page unchanged.

- [ ] **Step 3: Manual verification.** Dev DB: build a drafted league via services (or reuse one), inject stats via the Task 15 mock script if already available — otherwise `npx tsx` a snippet calling `setTestStat`-equivalent upserts against dev DB; league page shows standings with weekly columns.

- [ ] **Step 4: Gates + commit.**

```bash
git add -A && git commit -m "feat: league standings table"
```

---

### Task 12: Entry roster page (weekly lineups)

**Files:**
- Create: `src/app/leagues/[leagueId]/entries/[entryId]/page.tsx`

- [ ] **Step 1: Page** (server component; membership-gated like the league page — read that file's gate first):

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getLeagueScores } from "@/lib/league-scores";
import { AppNav } from "@/components/app-nav";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };

export default async function EntryPage({
  params,
}: {
  params: Promise<{ leagueId: string; entryId: string }>;
}) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/entries/${entryId}`);
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  const scores = await getLeagueScores(db, leagueId);
  const entry = scores.entries.find((e) => e.entryId === entryId);
  if (!entry) notFound();
  const rank = scores.entries.findIndex((e) => e.entryId === entryId) + 1;

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">{entry.name}</h1>
        <p className="text-sm text-gray-500">
          {entry.ownerName} · #{rank} · {entry.grandTotal.toFixed(2)} pts ·{" "}
          <Link href={`/leagues/${leagueId}`} className="underline">back to league</Link>
        </p>
        {entry.weeks.map((week) => (
          <section key={week.week} className="mt-6">
            <h2 className="font-semibold">
              {WEEK_LABELS[week.week] ?? `Week ${week.week}`}{" "}
              <span className="text-gray-500">— {week.total.toFixed(2)} pts</span>
            </h2>
            <ul className="mt-2 rounded-lg border">
              {week.lineup.map((slot) => (
                <li key={slot.slotIndex} className="flex items-center justify-between border-b p-2 text-sm last:border-b-0">
                  <span>
                    <span className="inline-block w-12 font-medium text-gray-500">{slot.slotLabel}</span>
                    {slot.playerId ? (
                      <Link href={`/leagues/${leagueId}/players/${slot.playerId}`} className="hover:underline">
                        {slot.playerName}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </span>
                  <span className="tabular-nums">{slot.points.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {week.bench.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Bench: {week.bench.map((b) => `${b.playerName} ${b.points.toFixed(2)}`).join(" · ")}
              </p>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Gates + manual check + commit.**

```bash
git add -A && git commit -m "feat: entry page with weekly optimal lineups"
```

---

### Task 13: Player detail page (game-by-game breakdown)

**Files:**
- Create: `src/app/leagues/[leagueId]/players/[playerId]/page.tsx`

- [ ] **Step 1: Page** (server; membership-gated; per-league scoring):

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseLeagueSettings } from "@/domain/league-settings";
import { computePoints, roundPoints } from "@/domain/scoring/compute-points";
import { tryParseStatLine } from "@/domain/stats/stat-line";
import { AppNav } from "@/components/app-nav";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };
const CATEGORIES = ["passing", "rushing", "receiving", "kicking", "defense", "misc"] as const;

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ leagueId: string; playerId: string }>;
}) {
  const { leagueId, playerId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/players/${playerId}`);
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });
  const player = await db.player.findUnique({
    where: { id: playerId },
    include: { stats: { where: { season: league.season }, orderBy: { week: "asc" } } },
  });
  if (!player || player.season !== league.season) notFound();
  const settings = parseLeagueSettings(league.settings);

  const games = player.stats.flatMap((row) => {
    const line = tryParseStatLine(row.stats);
    if (!line) return [];
    return [{ week: row.week, breakdown: computePoints(line, settings.scoring), line }];
  });

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">{player.name}</h1>
        <p className="text-sm text-gray-500">
          {player.position} · {player.nflTeam} ·{" "}
          <Link href={`/leagues/${leagueId}`} className="underline">back to league</Link>
        </p>
        {games.length === 0 && <p className="mt-6 text-gray-600">No stats yet this postseason.</p>}
        {games.map(({ week, breakdown, line }) => (
          <section key={week} className="mt-6 rounded-lg border p-4">
            <h2 className="flex items-center justify-between font-semibold">
              <span>{WEEK_LABELS[week] ?? `Week ${week}`}</span>
              <span className="tabular-nums">{roundPoints(breakdown.total).toFixed(2)} pts</span>
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {CATEGORIES.filter((c) => Math.abs(breakdown[c]) > 0.001).map((c) => (
                <div key={c}>
                  <dt className="text-gray-500 capitalize">{c}</dt>
                  <dd className="tabular-nums">{roundPoints(breakdown[c]).toFixed(2)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-gray-500">
              {[
                line.passYards ? `${line.passYards} pass yds, ${line.passTd} TD, ${line.passInt} INT` : null,
                line.rushYards ? `${line.rushYards} rush yds, ${line.rushTd} TD` : null,
                line.receptions ? `${line.receptions} rec, ${line.recYards} yds, ${line.recTd} TD` : null,
                line.fgMade.length ? `FG: ${line.fgMade.join(", ")}` : null,
                line.pointsAllowed !== null ? `${line.pointsAllowed} pts allowed` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        ))}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Gates + manual check + commit.**

```bash
git add -A && git commit -m "feat: player game-by-game breakdown per league scoring"
```

---

### Task 14: Platform admin — sync controls + stat override

**Files:**
- Create: `src/lib/admin.ts`, `src/app/admin/page.tsx`, `src/components/admin-panel.tsx`
- Create: `src/app/api/admin/sync/pool/route.ts`, `src/app/api/admin/sync/week/route.ts`, `src/app/api/admin/stats/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Gate** — create `src/lib/admin.ts`:

```ts
// Platform operators (us), NOT league commissioners. Comma-separated emails.
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdmin(user: { email: string } | null): boolean {
  return user !== null && adminEmails.has(user.email.toLowerCase());
}
```

`.env.example`: `# Platform admin emails (comma-separated) — unlocks /admin` + `ADMIN_EMAILS=""`. Add `ADMIN_EMAILS="hello@njgerner.com"`-style example in the comment only, keep the value empty.

- [ ] **Step 2: Admin APIs** (all: 404 when not admin — don't advertise the surface):

`src/app/api/admin/sync/pool/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { espnProvider } from "@/lib/stats/espn-provider";
import { syncPlayerPool } from "@/domain/stats/sync-pool";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({ teams: z.array(z.string().min(2).max(3)).min(1).max(14) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await syncPlayerPool(db, espnProvider, {
    season: CURRENT_SEASON,
    teams: parsed.data.teams.map((t) => t.toUpperCase()),
  });
  return NextResponse.json(result);
}
```

`src/app/api/admin/sync/week/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { espnProvider } from "@/lib/stats/espn-provider";
import { syncWeekStats } from "@/domain/stats/sync-week";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({ week: z.number().int().min(1).max(4) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await syncWeekStats(db, espnProvider, {
    season: CURRENT_SEASON, week: parsed.data.week,
  });
  return NextResponse.json(result);
}
```

`src/app/api/admin/stats/route.ts` (manual override — the ESPN-broke-mid-playoffs lifeline):
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { statLineSchema } from "@/domain/stats/stat-line";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({
  playerId: z.string().min(1),
  week: z.number().int().min(1).max(4),
  stats: statLineSchema, // full replacement, zod-validated
});

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { playerId, week, stats } = parsed.data;
  const player = await db.player.findUnique({ where: { id: playerId } });
  if (!player) return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  const row = await db.playerStat.upsert({
    where: { playerId_season_week: { playerId, season: CURRENT_SEASON, week } },
    create: { playerId, season: CURRENT_SEASON, week, stats: stats as Prisma.InputJsonValue },
    update: { stats: stats as Prisma.InputJsonValue },
  });
  console.warn(`[admin] manual stat override by ${user!.email}: player ${playerId} week ${week}`);
  return NextResponse.json({ ok: true, id: row.id });
}
```

- [ ] **Step 3: Admin page** — `src/app/admin/page.tsx` (server: `isAdmin` gate → `notFound()` otherwise; renders sync status + the client panel):

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AppNav } from "@/components/app-nav";
import { AdminPanel } from "@/components/admin-panel";
import { CURRENT_SEASON } from "@/domain/season";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  const [games, playerCount, statCount] = await Promise.all([
    db.nflGame.findMany({ where: { season: CURRENT_SEASON }, orderBy: [{ week: "asc" }, { startsAt: "asc" }] }),
    db.player.count({ where: { season: CURRENT_SEASON } }),
    db.playerStat.count({ where: { season: CURRENT_SEASON } }),
  ]);

  return (
    <>
      <AppNav userName={user!.name} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Platform admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Season {CURRENT_SEASON} · {playerCount} players · {statCount} stat lines
        </p>
        <h2 className="mt-6 font-semibold">Games</h2>
        <ul className="mt-2 rounded-lg border text-sm">
          {games.map((g) => (
            <li key={g.id} className="flex justify-between border-b p-2 last:border-b-0">
              <span>W{g.week}: {g.awayTeam} @ {g.homeTeam}</span>
              <span className="text-gray-500">
                {g.state} {g.state !== "SCHEDULED" && `${g.awayScore}–${g.homeScore}`} · upd {g.updatedAt.toISOString().slice(0, 16)}
              </span>
            </li>
          ))}
          {games.length === 0 && <li className="p-3 text-gray-500">No games synced yet.</li>}
        </ul>
        <AdminPanel />
      </main>
    </>
  );
}
```

Create `src/components/admin-panel.tsx`:

```tsx
"use client";

import { useState } from "react";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function AdminPanel() {
  const [teams, setTeams] = useState("");
  const [week, setWeek] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; data: unknown }>) {
    setBusy(true);
    setError(null);
    setResult(null);
    setUnmatched([]);
    try {
      const { ok, data } = await action();
      if (ok) {
        const d = data as { created?: number; updated?: number; games?: number; statLines?: number; unmatched?: string[] };
        setResult(JSON.stringify({ ...d, unmatched: undefined }));
        setUnmatched(d.unmatched ?? []);
      } else {
        setError((data as { error?: string }).error ?? "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Sync player pool</h2>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Playoff team abbreviations (comma-separated)</span>
          <textarea
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
            placeholder="KC, BUF, BAL, PHI, DET, LAR, ..."
            rows={2}
            className="rounded-lg border px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy || teams.trim() === ""}
          onClick={() =>
            void run(() =>
              postJson("/api/admin/sync/pool", {
                teams: teams.split(",").map((t) => t.trim()).filter(Boolean),
              }),
            )
          }
          className="mt-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync pool"}
        </button>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Sync week stats</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-gray-600">Week (1=WC … 4=SB)</span>
          <input
            type="number"
            min={1}
            max={4}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="w-20 rounded-lg border px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => postJson("/api/admin/sync/week", { week }))}
          className="mt-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync week"}
        </button>
      </section>

      {result && <p className="text-sm text-gray-700">{result}</p>}
      {unmatched.length > 0 && (
        <div className="text-sm text-red-600">
          <p className="font-medium">Unmatched stat lines ({unmatched.length}) — run a pool sync:</p>
          <ul className="mt-1 list-inside list-disc">
            {unmatched.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Manual verification.** Set ADMIN_EMAILS in worktree `.env` to your dev user's email; /admin renders; non-admin gets 404; POST week sync (real ESPN — last season's data) populates games; unmatched list is large (pool not synced) — expected.

- [ ] **Step 5: Gates + commit.**

```bash
git add -A && git commit -m "feat: platform admin — sync controls and manual stat override"
```

---

### Task 15: Mock-week script + full-season integration test

**Files:**
- Create: `scripts/mock-week.ts`, `src/domain/stats/mock-season.ts`
- Test: `tests/season-integration.test.ts`
- Modify: `package.json` (script)

- [ ] **Step 1: Deterministic mock data builder** — create `src/domain/stats/mock-season.ts`:

```ts
import type { PlayerPosition } from "@prisma/client";
import type { FakeStatsData, } from "./fake-provider";
import type { ProviderPlayerStats } from "./provider";
import { emptyStatLine, type StatLine } from "./stat-line";

interface MockPlayer {
  externalId: string;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
}

/** Deterministic pseudo-random from a string seed (no Math.random — reproducible). */
function seededNumber(seed: string, max: number): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % max;
}

function mockLine(p: MockPlayer, week: number): StatLine {
  const roll = (label: string, max: number) => seededNumber(`${p.externalId}:${week}:${label}`, max);
  const line = emptyStatLine();
  switch (p.position) {
    case "QB":
      return { ...line, passYards: 150 + roll("py", 250), passTd: roll("ptd", 4), passInt: roll("int", 3), rushYards: roll("ry", 40) };
    case "RB":
      return { ...line, rushYards: 30 + roll("ry", 120), rushTd: roll("rtd", 3), receptions: roll("rec", 6), recYards: roll("recy", 60) };
    case "WR":
      return { ...line, receptions: 2 + roll("rec", 9), recYards: 20 + roll("recy", 130), recTd: roll("rtd", 2) };
    case "TE":
      return { ...line, receptions: 1 + roll("rec", 7), recYards: 10 + roll("recy", 80), recTd: roll("rtd", 2) };
    case "K":
      return { ...line, fgMade: Array.from({ length: 1 + roll("fg", 3) }, (_, i) => 25 + roll(`d${i}`, 30)), xpMade: roll("xp", 5) };
    case "DST":
      return { ...line, sacks: roll("sk", 5), defInterceptions: roll("di", 3), pointsAllowed: roll("pa", 35) };
  }
}

/** One mock playoff week for a set of players (one shared fake game). */
export function buildMockWeek(players: MockPlayer[], season: number, week: number): FakeStatsData {
  const eventId = `mock-${season}-w${week}`;
  const stats: ProviderPlayerStats[] = players.map((p) => ({
    externalId: p.externalId, name: p.name, position: p.position, nflTeam: p.nflTeam,
    stats: mockLine(p, week),
  }));
  return {
    games: [
      {
        eventId, week, homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date(Date.UTC(2027, 0, 9 + week * 7)), state: "FINAL",
        homeScore: 20 + seededNumber(`${eventId}:h`, 20), awayScore: 20 + seededNumber(`${eventId}:a`, 20),
      },
    ],
    stats: { [eventId]: stats },
    rosters: {},
  };
}
```

- [ ] **Step 2: Dev script** — create `scripts/mock-week.ts` (mirror `prisma/seed-players-cli.ts` client construction exactly):

```ts
// Simulates a playoff week against the DEV database: every pooled player gets a
// deterministic stat line. Usage: npm run mock:week -- 1
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FakeStatsProvider } from "../src/domain/stats/fake-provider";
import { buildMockWeek } from "../src/domain/stats/mock-season";
import { syncWeekStats } from "../src/domain/stats/sync-week";
import { CURRENT_SEASON } from "../src/domain/season";

async function main() {
  const week = Number(process.argv[2]);
  if (![1, 2, 3, 4].includes(week)) throw new Error("usage: npm run mock:week -- <1|2|3|4>");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const players = await db.player.findMany({ where: { season: CURRENT_SEASON } });
  const withIds = players.map((p) => ({
    externalId: p.externalId ?? `mock-${p.id}`,
    name: p.name, position: p.position, nflTeam: p.nflTeam,
  }));
  // ensure every player has an externalId so sync can match
  for (const p of players.filter((p) => !p.externalId)) {
    await db.player.update({ where: { id: p.id }, data: { externalId: `mock-${p.id}` } });
  }
  const provider = new FakeStatsProvider(buildMockWeek(withIds, CURRENT_SEASON, week));
  const result = await syncWeekStats(db, provider, { season: CURRENT_SEASON, week });
  console.log(`Mock week ${week}:`, result);
  await db.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

package.json: `"mock:week": "dotenv -e .env -- tsx scripts/mock-week.ts"`.

- [ ] **Step 3: Full-season integration test** — create `tests/season-integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createStandardPool } from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { FakeStatsProvider } from "@/domain/stats/fake-provider";
import { buildMockWeek } from "@/domain/stats/mock-season";
import { syncWeekStats } from "@/domain/stats/sync-week";
import { getLeagueScores } from "@/lib/league-scores";
import { CURRENT_SEASON, PLAYOFF_WEEKS } from "@/domain/season";

describe("full mock season", () => {
  beforeEach(resetDb);

  it("draft → four synced weeks → stable, complete leaderboard", async () => {
    const commish = await createTestUser("Commish");
    const friend = await createTestUser("Friend");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "Season", teamName: "CT",
      scoringPreset: "half_ppr", pickClockHours: 8,
    });
    await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
    await createStandardPool(2);
    // pool sync equivalence: give every player an externalId
    const players = await testDb.player.findMany();
    for (const p of players) {
      await testDb.player.update({ where: { id: p.id }, data: { externalId: `x-${p.id}` } });
    }
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    for (let i = 0; i < 18; i++) {
      await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
    }

    const mockPlayers = (await testDb.player.findMany()).map((p) => ({
      externalId: p.externalId!, name: p.name, position: p.position, nflTeam: p.nflTeam,
    }));
    for (const week of Object.values(PLAYOFF_WEEKS)) {
      const provider = new FakeStatsProvider(buildMockWeek(mockPlayers, CURRENT_SEASON, week));
      const result = await syncWeekStats(testDb, provider, { season: CURRENT_SEASON, week });
      expect(result.unmatched).toEqual([]);
    }

    const scores = await getLeagueScores(testDb, league.id);
    expect(scores.entries).toHaveLength(2);
    for (const entry of scores.entries) {
      expect(entry.weeks).toHaveLength(4);
      for (const week of entry.weeks) {
        expect(week.total).toBeGreaterThan(0);
        expect(week.lineup.filter((s) => s.playerId)).toHaveLength(9);
      }
      expect(entry.grandTotal).toBeCloseTo(
        entry.weeks.reduce((s, w) => s + w.total, 0),
        1,
      );
    }
    // deterministic: syncing the same mock week again changes nothing
    const before = JSON.stringify(scores);
    const provider = new FakeStatsProvider(buildMockWeek(mockPlayers, CURRENT_SEASON, 1));
    await syncWeekStats(testDb, provider, { season: CURRENT_SEASON, week: 1 });
    expect(JSON.stringify(await getLeagueScores(testDb, league.id))).toBe(before);
  });
});
```

- [ ] **Step 4: Run mock script against dev** (dev DB seeded): `npm run mock:week -- 1` then eyeball the league page standings.

- [ ] **Step 5: Gates + commit.**

```bash
git add -A && git commit -m "feat: mock season tooling and full-season integration test"
```

---

### Task 16: Delete legacy/ + docs + final sweep

**Files:**
- Delete: `legacy/` (entire directory)
- Modify: `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `README.md`

- [ ] **Step 1: Confirm nothing references legacy.** `grep -rn "legacy/" src/ tests/ e2e/ scripts/ prisma/ --include="*.ts" --include="*.tsx"` → must be empty (docs/ references are fine).

- [ ] **Step 2: Delete.**

```bash
git rm -r legacy/
```

Remove `"legacy"` from tsconfig `exclude`, `legacy/**` from eslint ignores, `legacy/node_modules/` from .gitignore. Update README: drop the `legacy/` project-structure entry and its "removed after Phase 3" note; add `src/domain/stats/` + `src/domain/scoring/` + `src/lib/stats/` to the structure sketch; document `npm run mock:week -- <1-4>` and the `/admin` page (ADMIN_EMAILS).

- [ ] **Step 3: Final sweep.**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

All green (report final counts).

- [ ] **Step 4: Commit.**

```bash
git add -A && git commit -m "chore: delete legacy prototype — the rebuild has fully replaced it"
```

---

## Deferred (explicit)

- **Phase 4:** Stripe + monetization gates wiring, ads slot, dues tracking + fake door, weekly recap/preview notifications, elimination/clinch scenarios, premium analytics (projections/odds/props/weather port), substitutions scoring, custom-scoring editor UI
- **Phase 5:** sync-failure Slack alerting, score caching if needed, Vercel/Neon production deploy, PostHog wiring, beta hardening
- Roster-shape config UI, licensed stats feed (the StatsProvider seam is ready for both)
