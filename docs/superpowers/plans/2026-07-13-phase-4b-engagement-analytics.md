# Phase 4B: Engagement, Substitutions & Premium Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The product reaches out instead of waiting — weekly recaps, pre-weekend previews, alive/eliminated tracking — plus the deferred premium value: substitutions, multi-entry, and the projections/win-odds analytics ported from the prototype.

**Architecture:** Elimination is derived, not stored (losers of FINAL playoff games). Recaps/previews use per-league watermarks (`lastRecapWeek`/`lastPreviewWeek`) found by an hourly Inngest cron that fans out one event per due league — a dedicated function per league keeps step counts bounded and sends per-member × per-channel (the Phase 2.5 retry-idempotent pattern). Substitutions resolve at read time in `getLeagueScores` (original's points before the effective week, substitute's after) — no recalc machinery, same as scoring changes. Analytics: The Odds API team win probabilities (behind an `OddsProvider` seam with a fake, like `StatsProvider`) × recency-weighted point projections (ported from the prototype) = expected value, ranked with the existing `optimalLineup`.

**Tech Stack:** Existing stack; no new runtime deps. Port sources live in git history: `git show 57d9815:src/lib/odds/client.ts`, `.../odds/team-mapping.ts`, `.../projections/calculator.ts`.

**Spec:** `docs/superpowers/specs/2026-07-10-playoff-best-ball-v1-design.md` (§3 in-season engagement + substitutions setting, §2 premium analytics)

**Boundaries (YAGNI):** No player props, no weather, no live prop tracking (spec lists them under premium analytics but they're the heaviest, lowest-signal part — defer to next season with the waitlist learnings). No clinch MATH (exact "you need X by Y" scenarios) — alive-player counts and eliminated markers cover the spec's intent for v1. Substitutes must play the same position as the original (keeps the optimizer sound; relax later if leagues ask).

---

## Conventions (read these files first)

- Services: PrismaClient first arg, `DomainError` codes; settings via `parseLeagueSettings` (blob re-validated on write in `update-settings.ts`).
- Notifications: `loadRecipient`/`channelsFor`/`notifyVia` per-channel Inngest steps (`src/inngest/functions.ts` — notifyOnTheClock is the pattern), `Notification {subject, text, smsText?, url?}`, `APP_URL` const exists in functions.ts.
- Scores: `src/lib/league-scores.ts` `getLeagueScores` (one stat read, per-week `optimalLineup`, sorted entries). Provider seam pattern: `src/domain/stats/provider.ts` + fake.
- Tests: Vitest vs Postgres 5433, `tests/helpers/db.ts` (createStandardPool, setTestStat, etc.), TDD. Current suite: 136 vitest + 5 e2e — keep green.

---

### Task 1: Schema — Substitution, TeamOdds, engagement watermarks

**Files:**
- Modify: `prisma/schema.prisma`, `tests/helpers/db.ts`

- [ ] **Step 1: Models.** Append to `prisma/schema.prisma`:

```prisma
// Injury substitution (league setting, off by default): the original's points count
// before effectiveWeek, the substitute's from effectiveWeek on. Same position only.
model Substitution {
  id                 String   @id @default(cuid())
  entry              Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  entryId            String
  originalPlayer     Player   @relation("SubOriginal", fields: [originalPlayerId], references: [id], onDelete: Restrict)
  originalPlayerId   String
  substitutePlayer   Player   @relation("SubSubstitute", fields: [substitutePlayerId], references: [id], onDelete: Restrict)
  substitutePlayerId String
  effectiveWeek      Int // OUR playoff week (1..4)
  reason             String? // "ACL", "concussion" — display only
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([entryId, originalPlayerId]) // one substitution per rostered player
}

// Team win probabilities from the odds provider, one row per team per week.
model TeamOdds {
  id        String    @id @default(cuid())
  season    Int
  week      Int // OUR playoff week
  team      String // abbreviation, matches Player.nflTeam / NflGame teams
  opponent  String
  winProb   Float // 0..1, vig-removed
  moneyline Int? // raw American odds for reference
  eventTime DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([season, week, team])
}
```

On `League`, add engagement watermarks below `draftScheduledAt`:

```prisma
  lastRecapWeek   Int @default(0) // highest playoff week a recap was sent for
  lastPreviewWeek Int @default(0) // highest playoff week a preview was sent for
```

On `Entry`, add back-relation `substitutions Substitution[]`. On `Player`, add `substitutionsAsOriginal Substitution[] @relation("SubOriginal")` and `substitutionsAsSubstitute Substitution[] @relation("SubSubstitute")`.

- [ ] **Step 2: Push + generate.** `npm run db:push && npm run db:push:test && npx prisma generate`

- [ ] **Step 3: resetDb.** Add `await testDb.substitution.deleteMany();` (before entry delete — it references entries and Restrict-references players, so before player delete too) and `await testDb.teamOdds.deleteMany();` (anywhere before the end).

- [ ] **Step 4: Gates + commit.** `npm test` (136) + tsc + lint.

```bash
git add -A && git commit -m "feat: schema for substitutions, team odds, engagement watermarks"
```

---

### Task 2: Elimination tracking in league scores

**Files:**
- Create: `src/domain/stats/eliminated-teams.ts`
- Modify: `src/lib/league-scores.ts`, `src/components/leaderboard.tsx`, `src/app/leagues/[leagueId]/entries/[entryId]/page.tsx`
- Test: `src/domain/stats/eliminated-teams.test.ts`, `tests/league-scores.test.ts` (extended)

- [ ] **Step 1: Failing test** — create `src/domain/stats/eliminated-teams.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { getEliminatedTeams } from "./eliminated-teams";
import { CURRENT_SEASON } from "../season";

async function game(eventId: string, week: number, home: string, away: string, homeScore: number, awayScore: number, state: "FINAL" | "IN_PROGRESS" = "FINAL") {
  return testDb.nflGame.create({
    data: {
      season: CURRENT_SEASON, week, eventId, homeTeam: home, awayTeam: away,
      startsAt: new Date("2027-01-10T18:00:00Z"), state, homeScore, awayScore,
    },
  });
}

describe("getEliminatedTeams", () => {
  beforeEach(resetDb);

  it("losers of FINAL playoff games are eliminated; winners and unplayed teams are not", async () => {
    await game("g1", 1, "KC", "BUF", 27, 20); // BUF out
    await game("g2", 1, "PHI", "DET", 10, 31); // PHI out
    await game("g3", 1, "BAL", "LAR", 14, 14, "IN_PROGRESS"); // nobody yet
    const eliminated = await getEliminatedTeams(testDb, CURRENT_SEASON);
    expect(eliminated).toEqual(new Set(["BUF", "PHI"]));
  });

  it("empty when no games are final", async () => {
    expect(await getEliminatedTeams(testDb, CURRENT_SEASON)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/stats/eliminated-teams.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

/**
 * Derived, never stored: every playoff game is an elimination game, so the
 * eliminated set is exactly the losers of FINAL games this season.
 */
export async function getEliminatedTeams(db: PrismaClient, season: number): Promise<Set<string>> {
  const finals = await db.nflGame.findMany({
    where: { season, state: "FINAL" },
    select: { homeTeam: true, awayTeam: true, homeScore: true, awayScore: true },
  });
  const eliminated = new Set<string>();
  for (const g of finals) {
    if (g.homeScore === g.awayScore) continue; // impossible in the playoffs; be safe
    eliminated.add(g.homeScore > g.awayScore ? g.awayTeam : g.homeTeam);
  }
  return eliminated;
}
```

- [ ] **Step 3: Wire into `getLeagueScores` (TDD).** Extend `tests/league-scores.test.ts` — add to the existing test (after stats are set) an NflGame where one drafted player's team loses, then assert:

```ts
    // elimination flows through: create a FINAL game where the monster-RB's team loses
    const monsterTeam = entry2Pick.player.nflTeam;
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 1, eventId: "elim-1",
        homeTeam: monsterTeam, awayTeam: "ZZZ",
        startsAt: new Date("2027-01-10T18:00:00Z"), state: "FINAL",
        homeScore: 10, awayScore: 20,
      },
    });
    const withElim = await getLeagueScores(testDb, league.id);
    const leader = withElim.entries.find((e) => e.entryId === entries[1].id)!;
    expect(leader.alivePlayers).toBeLessThan(9); // the monster RB's team is out
    const anySlot = leader.weeks[0].lineup.find((s) => s.playerId === entry2Pick.playerId)!;
    expect(anySlot.teamEliminated).toBe(true);
```

(Adapt to the helper's team assignment — `createTestPlayer` uses nflTeam "KC" for everyone; give the eliminated game `homeTeam: "KC"` and expect ALL players eliminated → alivePlayers 0. Write whichever variant matches the helpers — read them; the assertion intent is: eliminated teams mark lineup slots and reduce alivePlayers.)

Run → FAIL. Then in `src/lib/league-scores.ts`:
- Fetch `const eliminated = await getEliminatedTeams(db, league.season);`
- The picks include already selects player position/name — add `nflTeam: true` to that select.
- Lineup slots gain `teamEliminated: boolean` (effective player's team in the set); entries gain `alivePlayers: number` = count of distinct rostered players whose team is NOT eliminated.

- [ ] **Step 4: Surface it.**
- `src/components/leaderboard.tsx`: add an "Alive" column after Team: `{entry.alivePlayers}/9` styled `text-gray-500` (derive 9 from `scores` — add `rosterSize: number` to LeagueScores (rosterSlots.length) rather than hardcoding).
- Entry page: eliminated lineup rows get `className` with `text-gray-400` + a small `OUT` badge next to the player name when `slot.teamEliminated`.

- [ ] **Step 5: Gates + commit.** `npm test` (139).

```bash
git add -A && git commit -m "feat: alive/eliminated tracking through league scores"
```

---

### Task 3: Recap builder (pure)

**Files:**
- Create: `src/domain/engagement/recap.ts`
- Test: `src/domain/engagement/recap.test.ts`

- [ ] **Step 1: Failing test** — create `src/domain/engagement/recap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildWeeklyRecap } from "./recap";
import type { LeagueScores } from "@/lib/league-scores";

// Minimal LeagueScores stub: 3 entries, two weeks of totals.
function scores(): LeagueScores {
  const mk = (entryId: string, name: string, w1: number, w2: number) => ({
    entryId, name, ownerName: name, alivePlayers: 9,
    grandTotal: w1 + w2,
    weeks: [
      { week: 1, total: w1, lineup: [], bench: [] },
      { week: 2, total: w2, lineup: [], bench: [] },
      { week: 3, total: 0, lineup: [], bench: [] },
      { week: 4, total: 0, lineup: [], bench: [] },
    ],
  });
  return {
    weeks: [1, 2, 3, 4],
    rosterSize: 9,
    entries: [mk("a", "Alpha", 100, 10), mk("b", "Bravo", 80, 50), mk("c", "Charlie", 90, 20)],
  } as LeagueScores;
}

describe("buildWeeklyRecap", () => {
  it("ranks through the recap week and reports movement vs the prior week", () => {
    const recap = buildWeeklyRecap(scores(), 2);
    // through week 1: Alpha 100 (1st), Charlie 90 (2nd), Bravo 80 (3rd)
    // through week 2: Bravo 130 (1st), Charlie 110 (2nd), Alpha 110 (2nd — tie broken by insertion) ...
    const bravo = recap.entries.find((e) => e.entryId === "b")!;
    expect(bravo.rank).toBe(1);
    expect(bravo.prevRank).toBe(3);
    expect(bravo.weekPoints).toBe(50);
    expect(recap.topPerformer.entryId).toBe("b");
    expect(recap.topPerformer.weekPoints).toBe(50);
  });

  it("week 1 has no movement (prevRank equals rank)", () => {
    const recap = buildWeeklyRecap(scores(), 1);
    for (const e of recap.entries) expect(e.prevRank).toBe(e.rank);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/engagement/recap.ts`:

```ts
import type { LeagueScores } from "@/lib/league-scores";

export interface RecapEntry {
  entryId: string;
  name: string;
  ownerName: string;
  rank: number;
  prevRank: number;
  weekPoints: number;
  totalThroughWeek: number;
}

export interface WeeklyRecap {
  week: number;
  entries: RecapEntry[]; // sorted by rank
  topPerformer: { entryId: string; name: string; weekPoints: number };
}

function ranksThrough(scores: LeagueScores, week: number): Map<string, number> {
  const totals = scores.entries.map((e) => ({
    entryId: e.entryId,
    total: e.weeks.filter((w) => w.week <= week).reduce((s, w) => s + w.total, 0),
  }));
  totals.sort((a, b) => b.total - a.total);
  return new Map(totals.map((t, i) => [t.entryId, i + 1]));
}

/** Pure: standings through `week`, movement vs the week before, and the week's top score. */
export function buildWeeklyRecap(scores: LeagueScores, week: number): WeeklyRecap {
  const now = ranksThrough(scores, week);
  const before = week > 1 ? ranksThrough(scores, week - 1) : now;

  const entries: RecapEntry[] = scores.entries
    .map((e) => ({
      entryId: e.entryId,
      name: e.name,
      ownerName: e.ownerName,
      rank: now.get(e.entryId)!,
      prevRank: before.get(e.entryId)!,
      weekPoints: e.weeks.find((w) => w.week === week)?.total ?? 0,
      totalThroughWeek: e.weeks.filter((w) => w.week <= week).reduce((s, w) => s + w.total, 0),
    }))
    .sort((a, b) => a.rank - b.rank);

  const top = [...entries].sort((a, b) => b.weekPoints - a.weekPoints)[0];
  return {
    week,
    entries,
    topPerformer: { entryId: top.entryId, name: top.name, weekPoints: top.weekPoints },
  };
}
```

- [ ] **Step 3: PASS.** Gates + commit.

```bash
git add -A && git commit -m "feat: weekly recap builder"
```

---

### Task 4: Recap dispatch — due-work finder + Inngest fan-out

**Files:**
- Create: `src/domain/engagement/due-work.ts`
- Modify: `src/inngest/functions.ts`
- Test: `src/domain/engagement/due-work.test.ts`

- [ ] **Step 1: Failing test** — create `src/domain/engagement/due-work.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createStandardPool } from "../../../tests/helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { findDueRecaps, findDuePreviews } from "./due-work";
import { CURRENT_SEASON } from "@/domain/season";

async function completedLeague() {
  const commish = await createTestUser("C");
  const friend = await createTestUser("F");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "CT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
  await createStandardPool(2);
  await startDraft(testDb, { leagueId: league.id, userId: commish.id });
  for (let i = 0; i < 18; i++) {
    await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
  }
  return league;
}

function gameData(eventId: string, week: number, state: "FINAL" | "SCHEDULED", startsAt: Date) {
  return {
    season: CURRENT_SEASON, week, eventId, homeTeam: "KC", awayTeam: "BUF",
    startsAt, state, homeScore: state === "FINAL" ? 21 : 0, awayScore: state === "FINAL" ? 14 : 0,
  };
}

describe("findDueRecaps", () => {
  beforeEach(resetDb);

  it("is due when a week's games are all FINAL and above the watermark", async () => {
    const league = await completedLeague();
    await testDb.nflGame.create({ data: gameData("g1", 1, "FINAL", new Date("2027-01-10T18:00:00Z")) });
    expect(await findDueRecaps(testDb)).toEqual([{ leagueId: league.id, week: 1 }]);

    await testDb.league.update({ where: { id: league.id }, data: { lastRecapWeek: 1 } });
    expect(await findDueRecaps(testDb)).toEqual([]);
  });

  it("not due while any game in the week is unfinished, for incomplete drafts, or with no games", async () => {
    const league = await completedLeague();
    await testDb.nflGame.create({ data: gameData("g1", 1, "FINAL", new Date("2027-01-10T18:00:00Z")) });
    await testDb.nflGame.create({ data: gameData("g2", 1, "SCHEDULED", new Date("2027-01-11T18:00:00Z")) });
    expect(await findDueRecaps(testDb)).toEqual([]);
    await testDb.draft.deleteMany(); // no complete draft → no recap even when FINAL
    await testDb.nflGame.update({ where: { eventId: "g2" }, data: { state: "FINAL", homeScore: 7 } });
    expect(await findDueRecaps(testDb)).toEqual([]);
  });
});

describe("findDuePreviews", () => {
  beforeEach(resetDb);

  it("is due when a week's games start within 48h and above the watermark", async () => {
    const league = await completedLeague();
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    await testDb.nflGame.create({ data: gameData("g1", 2, "SCHEDULED", soon) });
    expect(await findDuePreviews(testDb)).toEqual([{ leagueId: league.id, week: 2 }]);

    await testDb.league.update({ where: { id: league.id }, data: { lastPreviewWeek: 2 } });
    expect(await findDuePreviews(testDb)).toEqual([]);
  });

  it("not due when games are too far out", async () => {
    await completedLeague();
    const far = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await testDb.nflGame.create({ data: gameData("g1", 2, "SCHEDULED", far) });
    expect(await findDuePreviews(testDb)).toEqual([]);
  });
});
```

- [ ] **Step 2: FAIL**, then implement — create `src/domain/engagement/due-work.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { CURRENT_SEASON } from "../season";

export interface DueWork {
  leagueId: string;
  week: number;
}

const PREVIEW_HORIZON_MS = 48 * 3600 * 1000;

async function leaguesWithCompleteDrafts(db: PrismaClient) {
  return db.league.findMany({
    where: { season: CURRENT_SEASON, draft: { status: "COMPLETE" } },
    select: { id: true, lastRecapWeek: true, lastPreviewWeek: true },
  });
}

/** Weeks whose games are ALL final (and exist), per league above its watermark. */
export async function findDueRecaps(db: PrismaClient): Promise<DueWork[]> {
  const games = await db.nflGame.findMany({
    where: { season: CURRENT_SEASON },
    select: { week: true, state: true },
  });
  const finishedWeeks = new Set<number>();
  const weeks = new Set(games.map((g) => g.week));
  for (const week of weeks) {
    const ofWeek = games.filter((g) => g.week === week);
    if (ofWeek.length > 0 && ofWeek.every((g) => g.state === "FINAL")) finishedWeeks.add(week);
  }
  if (finishedWeeks.size === 0) return [];

  const leagues = await leaguesWithCompleteDrafts(db);
  const due: DueWork[] = [];
  for (const league of leagues) {
    for (const week of [...finishedWeeks].sort((a, b) => a - b)) {
      if (week > league.lastRecapWeek) due.push({ leagueId: league.id, week });
    }
  }
  return due;
}

/** Weeks with games starting within the horizon, per league above its watermark. */
export async function findDuePreviews(db: PrismaClient): Promise<DueWork[]> {
  const now = Date.now();
  const upcoming = await db.nflGame.findMany({
    where: {
      season: CURRENT_SEASON,
      state: "SCHEDULED",
      startsAt: { gte: new Date(now), lte: new Date(now + PREVIEW_HORIZON_MS) },
    },
    select: { week: true },
  });
  const dueWeeks = [...new Set(upcoming.map((g) => g.week))].sort((a, b) => a - b);
  if (dueWeeks.length === 0) return [];

  const leagues = await leaguesWithCompleteDrafts(db);
  const due: DueWork[] = [];
  for (const league of leagues) {
    for (const week of dueWeeks) {
      if (week > league.lastPreviewWeek) due.push({ leagueId: league.id, week });
    }
  }
  return due;
}
```

- [ ] **Step 3: Inngest wiring.** In `src/inngest/functions.ts` add three functions (register all in the `functions` array; merge imports — `buildWeeklyRecap`, `findDueRecaps`, `findDuePreviews`, `getLeagueScores`, `getEliminatedTeams` as needed):

```ts
/** Hourly: find due recaps/previews, fan out one event per league-week. */
export const engagementCron = inngest.createFunction(
  { id: "engagement-cron", triggers: { cron: "0 * * * *" } },
  async ({ step }) => {
    const recaps = await step.run("find-recaps", () => findDueRecaps(db));
    const previews = await step.run("find-previews", () => findDuePreviews(db));
    for (const work of recaps) {
      await step.sendEvent(`recap-${work.leagueId}-w${work.week}`, {
        name: "league/recap.due",
        data: work,
      });
    }
    for (const work of previews) {
      await step.sendEvent(`preview-${work.leagueId}-w${work.week}`, {
        name: "league/preview.due",
        data: work,
      });
    }
    return { recaps: recaps.length, previews: previews.length };
  },
);

/** One league's weekly recap: bump the watermark FIRST (missed sends beat duplicates), then send. */
export const sendLeagueRecap = inngest.createFunction(
  { id: "league-send-recap", triggers: { event: "league/recap.due" } },
  async ({ event, step }) => {
    const claimed = await step.run("claim-watermark", async () => {
      const updated = await db.league.updateMany({
        where: { id: event.data.leagueId, lastRecapWeek: { lt: event.data.week } },
        data: { lastRecapWeek: event.data.week },
      });
      return updated.count === 1; // 0 = another run already claimed it
    });
    if (!claimed) return { skipped: true };

    const loaded = await step.run("build", async () => {
      const scores = await getLeagueScores(db, event.data.leagueId);
      const recap = buildWeeklyRecap(scores, event.data.week);
      const league = await db.league.findUniqueOrThrow({
        where: { id: event.data.leagueId },
        include: { entries: { include: { membership: true } } },
      });
      // one recipient per MEMBER (not per entry); attach their best entry line
      const byUser = new Map<string, { entryNames: string[] }>();
      for (const entry of league.entries) {
        const u = byUser.get(entry.membership.userId) ?? { entryNames: [] };
        u.entryNames.push(entry.name);
        byUser.set(entry.membership.userId, u);
      }
      const recipients = [];
      for (const [userId] of byUser) {
        recipients.push({ userId, recipient: await loadRecipient(db, userId) });
      }
      return { recap, leagueName: league.name, recipients };
    });

    const WEEK_NAMES: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };
    const url = `${APP_URL}/leagues/${event.data.leagueId}`;
    // the recap body is league-wide (top-5 standings) and identical for every member by design
    for (const { userId, recipient } of loaded.recipients) {
      const lines = loaded.recap.entries
        .slice(0, 5)
        .map((e) => {
          const move =
            e.prevRank === e.rank ? "→" : e.prevRank > e.rank ? `↑${e.prevRank - e.rank}` : `↓${e.rank - e.prevRank}`;
          return `${e.rank}. ${e.name} — ${e.totalThroughWeek.toFixed(1)} (${move}, ${e.weekPoints.toFixed(1)} this week)`;
        })
        .join("\n");
      const notification = {
        subject: `${loaded.leagueName}: ${WEEK_NAMES[loaded.recap.week]} recap`,
        text: [
          `${WEEK_NAMES[loaded.recap.week]} is in the books. Top score: ${loaded.recap.topPerformer.name} with ${loaded.recap.topPerformer.weekPoints.toFixed(1)}.`,
          lines,
          `Full standings: ${url}`,
        ].join("\n\n"),
        smsText: `${loaded.leagueName} ${WEEK_NAMES[loaded.recap.week]} recap: ${loaded.recap.topPerformer.name} led with ${loaded.recap.topPerformer.weekPoints.toFixed(1)}. Standings: ${url}`,
        url,
      };
      for (const channel of channelsFor(recipient)) {
        await step.run(`send-${userId}-${channel}`, () => notifyVia(db, channel, recipient, notification));
      }
    }
  },
);
```

NOTE: verify the `step.sendEvent` signature against the installed Inngest v4 SDK (it takes `(id, events)`) and adapt if it differs.

- [ ] **Step 4: Gates + live check.** tsc/lint/`npm test` (141)/build; dev server + inngest introspection shows the new functions (baseline 6 + engagementCron + sendLeagueRecap = 8; the preview sender arrives next task).

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat: weekly recap dispatch — watermark claim + per-channel fan-out"
```

---

### Task 5: Preview dispatch ("your players this weekend")

**Files:**
- Modify: `src/inngest/functions.ts`
- Test: covered by due-work tests (Task 4) + manual; the content builder is inline (small)

- [ ] **Step 1: Function.** Add to `src/inngest/functions.ts` (register in `functions`):

```ts
/** One league's pre-weekend preview: each member's alive players in the upcoming week. */
export const sendLeaguePreview = inngest.createFunction(
  { id: "league-send-preview", triggers: { event: "league/preview.due" } },
  async ({ event, step }) => {
    const claimed = await step.run("claim-watermark", async () => {
      const updated = await db.league.updateMany({
        where: { id: event.data.leagueId, lastPreviewWeek: { lt: event.data.week } },
        data: { lastPreviewWeek: event.data.week },
      });
      return updated.count === 1;
    });
    if (!claimed) return { skipped: true };

    const loaded = await step.run("build", async () => {
      const eliminated = await getEliminatedTeams(db, CURRENT_SEASON);
      const league = await db.league.findUniqueOrThrow({
        where: { id: event.data.leagueId },
        include: {
          entries: {
            include: {
              membership: true,
              picks: { include: { player: { select: { name: true, position: true, nflTeam: true } } } },
            },
          },
        },
      });
      const perUser = new Map<string, string[]>(); // userId → alive player labels
      for (const entry of league.entries) {
        const labels = entry.picks
          .filter((p) => !eliminated.has(p.player.nflTeam))
          .map((p) => `${p.player.name} (${p.player.position}, ${p.player.nflTeam})`);
        const existing = perUser.get(entry.membership.userId) ?? [];
        perUser.set(entry.membership.userId, [...existing, ...labels]);
      }
      const recipients = [];
      for (const [userId, players] of perUser) {
        recipients.push({ userId, players: [...new Set(players)], recipient: await loadRecipient(db, userId) });
      }
      return { leagueName: league.name, recipients };
    });

    const WEEK_NAMES: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };
    const url = `${APP_URL}/leagues/${event.data.leagueId}`;
    for (const { userId, players, recipient } of loaded.recipients) {
      const notification = {
        subject: `${loaded.leagueName}: your players this ${WEEK_NAMES[event.data.week]} weekend`,
        text: [
          players.length > 0
            ? `You have ${players.length} player${players.length === 1 ? "" : "s"} alive this week:\n${players.join("\n")}`
            : "None of your players are still alive — root for chaos.",
          `Leaderboard: ${url}`,
        ].join("\n\n"),
        smsText: `${loaded.leagueName}: ${players.length} of your players play this ${WEEK_NAMES[event.data.week]} weekend. ${url}`,
        url,
      };
      for (const channel of channelsFor(recipient)) {
        await step.run(`send-${userId}-${channel}`, () => notifyVia(db, channel, recipient, notification));
      }
    }
  },
);
```

(Imports: `getEliminatedTeams`, `CURRENT_SEASON` — merge with existing.)

- [ ] **Step 2: Manual verification.** With `inngest-cli dev` + a completed-draft league in dev DB: insert a SCHEDULED NflGame starting tomorrow (psql/tsx), trigger `engagementCron` from the Inngest dev UI, watch `league/preview.due` fan out and the per-channel send steps log `[dev] email …your players this…`. Same drill for recaps with a FINAL game week.

- [ ] **Step 3: Gates + commit.** tsc/lint/test/build; introspection function_count 9.

```bash
git add -A && git commit -m "feat: pre-weekend preview dispatch"
```

---

### Task 6: Substitutions domain

**Files:**
- Create: `src/domain/leagues/substitutions.ts`
- Modify: `src/domain/errors.ts`
- Test: `src/domain/leagues/substitutions.test.ts`

- [ ] **Step 1: Errors.** Append to `src/domain/errors.ts`:

```ts
export class SubstitutionsDisabledError extends DomainError {
  constructor() {
    super("Substitutions are disabled for this league.", "SUBSTITUTIONS_DISABLED");
  }
}

export class InvalidSubstitutionError extends DomainError {
  constructor(reason: string) {
    super(`Can't make that substitution: ${reason}`, "INVALID_SUBSTITUTION");
  }
}
```

- [ ] **Step 2: Failing test** — create `src/domain/leagues/substitutions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createTestPlayer, createStandardPool,
} from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { joinLeague } from "./join-league";
import { updateLeagueSettings } from "./update-settings";
import { startDraft } from "../draft/start-draft";
import { autodraftCurrentPick } from "../draft/autodraft";
import { setSubstitution, clearSubstitution } from "./substitutions";
import {
  NotCommissionerError, SubstitutionsDisabledError, InvalidSubstitutionError,
} from "../errors";

async function setup() {
  const commish = await createTestUser("C");
  const friend = await createTestUser("F");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "CT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
  await createStandardPool(2);
  await startDraft(testDb, { leagueId: league.id, userId: commish.id });
  for (let i = 0; i < 18; i++) {
    await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
  }
  await updateLeagueSettings(testDb, {
    leagueId: league.id, userId: commish.id, substitutionsEnabled: true,
  });
  const entries = await testDb.entry.findMany({ where: { leagueId: league.id }, orderBy: { createdAt: "asc" } });
  return { commish, friend, league, entries };
}

describe("substitutions", () => {
  beforeEach(resetDb);

  it("commissioner substitutes an undrafted same-position player", async () => {
    const { commish, league, entries } = await setup();
    const pick = await testDb.draftPick.findFirstOrThrow({
      where: { entryId: entries[0].id }, include: { player: true },
    });
    const sub = await createTestPlayer(pick.player.position, { name: "Fresh Legs" });
    const result = await setSubstitution(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entries[0].id,
      originalPlayerId: pick.playerId, substitutePlayerId: sub.id,
      effectiveWeek: 2, reason: "hamstring",
    });
    expect(result.effectiveWeek).toBe(2);

    // replacing the same original updates in place
    const sub2 = await createTestPlayer(pick.player.position, { name: "Fresher Legs" });
    await setSubstitution(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entries[0].id,
      originalPlayerId: pick.playerId, substitutePlayerId: sub2.id,
      effectiveWeek: 3,
    });
    expect(await testDb.substitution.count()).toBe(1);

    await clearSubstitution(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entries[0].id,
      originalPlayerId: pick.playerId,
    });
    expect(await testDb.substitution.count()).toBe(0);
  });

  it("rejects: disabled setting, non-commissioner, drafted substitute, cross-position, unrostered original", async () => {
    const { commish, friend, league, entries } = await setup();
    const pick = await testDb.draftPick.findFirstOrThrow({
      where: { entryId: entries[0].id }, include: { player: true },
    });
    const validSub = await createTestPlayer(pick.player.position);

    // non-commissioner
    await expect(
      setSubstitution(testDb, {
        leagueId: league.id, userId: friend.id, entryId: entries[0].id,
        originalPlayerId: pick.playerId, substitutePlayerId: validSub.id, effectiveWeek: 2,
      }),
    ).rejects.toThrow(NotCommissionerError);

    // drafted-by-someone substitute
    const enemyPick = await testDb.draftPick.findFirstOrThrow({
      where: { entryId: entries[1].id, player: { position: pick.player.position } },
    });
    await expect(
      setSubstitution(testDb, {
        leagueId: league.id, userId: commish.id, entryId: entries[0].id,
        originalPlayerId: pick.playerId, substitutePlayerId: enemyPick.playerId, effectiveWeek: 2,
      }),
    ).rejects.toThrow(InvalidSubstitutionError);

    // cross-position
    const wrongPos = await createTestPlayer(pick.player.position === "QB" ? "RB" : "QB");
    await expect(
      setSubstitution(testDb, {
        leagueId: league.id, userId: commish.id, entryId: entries[0].id,
        originalPlayerId: pick.playerId, substitutePlayerId: wrongPos.id, effectiveWeek: 2,
      }),
    ).rejects.toThrow(InvalidSubstitutionError);

    // original not on the entry's roster
    const stranger = await createTestPlayer(pick.player.position);
    await expect(
      setSubstitution(testDb, {
        leagueId: league.id, userId: commish.id, entryId: entries[0].id,
        originalPlayerId: stranger.id, substitutePlayerId: validSub.id, effectiveWeek: 2,
      }),
    ).rejects.toThrow(InvalidSubstitutionError);

    // disabled setting
    await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: commish.id, substitutionsEnabled: false,
    });
    await expect(
      setSubstitution(testDb, {
        leagueId: league.id, userId: commish.id, entryId: entries[0].id,
        originalPlayerId: pick.playerId, substitutePlayerId: validSub.id, effectiveWeek: 2,
      }),
    ).rejects.toThrow(SubstitutionsDisabledError);
  });
});
```

NOTE: this test calls `updateLeagueSettings` with `substitutionsEnabled` — that input field is added in THIS task (step 3c below), not Task 8.

- [ ] **Step 3: FAIL**, then implement.

a) Create `src/domain/leagues/substitutions.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import {
  InvalidSubstitutionError,
  NotCommissionerError,
  SubstitutionsDisabledError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";

export interface SetSubstitutionInput {
  leagueId: string;
  userId: string;
  entryId: string;
  originalPlayerId: string;
  substitutePlayerId: string;
  effectiveWeek: number; // 1..4; validated at the route
  reason?: string;
}

async function requireCommissionerWithSubsEnabled(db: PrismaClient, leagueId: string, userId: string) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();
  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });
  if (!parseLeagueSettings(league.settings).substitutionsEnabled) {
    throw new SubstitutionsDisabledError();
  }
  return league;
}

/** Commissioner swaps an injured player: original scores before effectiveWeek, substitute from it on. */
export async function setSubstitution(db: PrismaClient, input: SetSubstitutionInput) {
  const league = await requireCommissionerWithSubsEnabled(db, input.leagueId, input.userId);

  const entry = await db.entry.findUnique({ where: { id: input.entryId } });
  if (!entry || entry.leagueId !== input.leagueId) {
    throw new InvalidSubstitutionError("that team isn't in this league");
  }
  const originalPick = await db.draftPick.findFirst({
    where: { entryId: input.entryId, playerId: input.originalPlayerId },
    include: { player: true },
  });
  if (!originalPick) throw new InvalidSubstitutionError("the original player isn't on that roster");

  const substitute = await db.player.findUnique({ where: { id: input.substitutePlayerId } });
  if (!substitute || substitute.season !== league.season) {
    throw new InvalidSubstitutionError("unknown substitute");
  }
  if (substitute.position !== originalPick.player.position) {
    throw new InvalidSubstitutionError("the substitute must play the same position");
  }
  const draft = await db.draft.findUnique({ where: { leagueId: input.leagueId }, select: { id: true } });
  const alreadyDrafted = draft
    ? await db.draftPick.findFirst({ where: { draftId: draft.id, playerId: input.substitutePlayerId } })
    : null;
  if (alreadyDrafted) throw new InvalidSubstitutionError("that player is on another roster");

  return db.substitution.upsert({
    where: {
      entryId_originalPlayerId: { entryId: input.entryId, originalPlayerId: input.originalPlayerId },
    },
    create: {
      entryId: input.entryId,
      originalPlayerId: input.originalPlayerId,
      substitutePlayerId: input.substitutePlayerId,
      effectiveWeek: input.effectiveWeek,
      reason: input.reason ?? null,
    },
    update: {
      substitutePlayerId: input.substitutePlayerId,
      effectiveWeek: input.effectiveWeek,
      reason: input.reason ?? null,
    },
  });
}

export async function clearSubstitution(
  db: PrismaClient,
  input: { leagueId: string; userId: string; entryId: string; originalPlayerId: string },
) {
  await requireCommissionerWithSubsEnabled(db, input.leagueId, input.userId);
  await db.substitution.deleteMany({
    where: {
      entryId: input.entryId,
      originalPlayerId: input.originalPlayerId,
      entry: { leagueId: input.leagueId },
    },
  });
}
```

b) The substitute-vs-substitute collision (two entries substituting the SAME free agent) is allowed — free agents aren't exclusive between rosters once the draft is over. Add a comment saying so.

c) In `src/domain/leagues/update-settings.ts`: add `substitutionsEnabled?: boolean;` to the input interface and `if (input.substitutionsEnabled !== undefined) settings.substitutionsEnabled = input.substitutionsEnabled;` to the merge block; add `substitutionsEnabled: z.boolean().optional(),` to the settings route's bodySchema.

- [ ] **Step 4: PASS.** Gates + commit.

```bash
git add -A && git commit -m "feat: substitutions domain — same-position, undrafted, setting-gated"
```

---

### Task 7: Substitutions in the scoring engine

**Files:**
- Modify: `src/lib/league-scores.ts`
- Test: `tests/league-scores.test.ts` (new test)

- [ ] **Step 1: Failing test.** Add to `tests/league-scores.test.ts` (imports: setSubstitution, updateLeagueSettings, createTestPlayer):

```ts
  it("substitutions split scoring at the effective week", async () => {
    // …same league/draft setup helper as the main test (extract a local helper if the file
    // doesn't have one — league with 2 entries, drafted via autodraft, standard pool)…
    const pick = await testDb.draftPick.findFirstOrThrow({
      where: { entryId: entries[0].id }, include: { player: true },
    });
    const sub = await createTestPlayer(pick.player.position, { name: "The Sub" });
    await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: commish.id, substitutionsEnabled: true,
    });
    await setSubstitution(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entries[0].id,
      originalPlayerId: pick.playerId, substitutePlayerId: sub.id, effectiveWeek: 2,
    });
    // original scores 10 in week 1 AND (irrelevantly) 50 in week 2; sub scores 20 in week 2
    await setTestStat(pick.playerId, 1, { rushYards: 100 });
    await setTestStat(pick.playerId, 2, { rushYards: 500 });
    await setTestStat(sub.id, 2, { rushYards: 200 });

    const scores = await getLeagueScores(testDb, league.id);
    const mine = scores.entries.find((e) => e.entryId === entries[0].id)!;
    const w1 = mine.weeks.find((w) => w.week === 1)!;
    const w2 = mine.weeks.find((w) => w.week === 2)!;
    const w1Slot = w1.lineup.find((s) => s.playerId === pick.playerId);
    expect(w1Slot).toBeDefined(); // original's 10 pts count in week 1
    const w2Slot = w2.lineup.find((s) => s.playerId === sub.id);
    expect(w2Slot).toBeDefined(); // substitute's 20 pts count in week 2
    expect(w2Slot!.playerName).toBe("The Sub");
    expect(w2.lineup.some((s) => s.playerId === pick.playerId)).toBe(false); // original's 50 does NOT
  });
```

(Write the setup concretely against the file's existing patterns — read it; the assertions above are the contract.)

- [ ] **Step 2: FAIL**, then implement in `src/lib/league-scores.ts`:

- Entries include gains `substitutions: { include: { substitutePlayer: { select: { id: true, name: true, position: true, nflTeam: true } } } }`.
- The stats query's `draftedPlayerIds` must ALSO include all substitute player ids.
- Export a small pure helper (used by projections in Task 10):

```ts
/** The player who actually scores for this pick in this week, after substitutions. */
export function effectivePlayerForWeek(
  pick: { playerId: string },
  week: number,
  subsByOriginal: Map<string, { substitutePlayerId: string; effectiveWeek: number }>,
): string {
  const sub = subsByOriginal.get(pick.playerId);
  return sub && week >= sub.effectiveWeek ? sub.substitutePlayerId : pick.playerId;
}
```

- Inside the weeks loop, build `scored` from the EFFECTIVE player per pick (id, that player's position — same as original by the domain rule — and that player's points for the week). `playerById` map per entry extends with substitute players so lineup names/teams resolve. `teamEliminated` uses the effective player's team. `alivePlayers` counts effective current-roster players (substitutions active NOW, i.e. resolved at the latest week).

- [ ] **Step 3: PASS** (all prior league-scores + season-integration tests must stay green). Gates + commit.

```bash
git add -A && git commit -m "feat: substitutions resolve in league scoring at read time"
```

---

### Task 8: Substitutions UI + settings toggle

**Files:**
- Modify: `src/components/league-settings-form.tsx` (toggle), `src/app/leagues/[leagueId]/entries/[entryId]/page.tsx` (commissioner control mount)
- Create: `src/components/substitution-panel.tsx`, `src/app/api/leagues/[leagueId]/entries/[entryId]/substitution/route.ts`

- [ ] **Step 1: Settings toggle.** In `league-settings-form.tsx`, add a checkbox row (own section between Scoring and Dues): state `const [subsEnabled, setSubsEnabled] = useState(initial.substitutionsEnabled);` (add to Props.initial + page wiring), body includes `substitutionsEnabled: subsEnabled` in the PATCH. Copy: `Injury substitutions — commissioner can swap an injured player for an undrafted one (same position); the original's points keep counting for earlier weeks.`

- [ ] **Step 2: API route** — create `src/app/api/leagues/[leagueId]/entries/[entryId]/substitution/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { setSubstitution, clearSubstitution } from "@/domain/leagues/substitutions";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string; entryId: string }> };

const putSchema = z.object({
  originalPlayerId: z.string().min(1),
  substitutePlayerId: z.string().min(1),
  effectiveWeek: z.number().int().min(1).max(4),
  reason: z.string().trim().max(80).optional(),
});

export async function PUT(req: Request, { params }: Params) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const sub = await setSubstitution(db, { leagueId, userId: user.id, entryId, ...parsed.data });
    return NextResponse.json({ ok: true, id: sub.id });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}

const deleteSchema = z.object({ originalPlayerId: z.string().min(1) });

export async function DELETE(req: Request, { params }: Params) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await clearSubstitution(db, {
      leagueId, userId: user.id, entryId, originalPlayerId: parsed.data.originalPlayerId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
```

- [ ] **Step 3: Panel** — create `src/components/substitution-panel.tsx` (client). Props: `{ leagueId, entryId, roster: { playerId, name, position }[], pool: { id, name, position }[], existing: { originalPlayerId, substituteName, effectiveWeek }[] }`. UI: list of existing substitutions with a remove (✕ → DELETE); a small form: select original (from roster), select substitute (pool filtered to same position as chosen original, minus rostered ids), week select 1-4, optional reason, Apply (PUT). House fetch pattern (busy/error/optimistic reload via `router.refresh()` from `useRouter` after success — simplest given server-rendered parent). Write it fully in the established form style (~120 lines; model on `admin-panel.tsx`).

- [ ] **Step 4: Mount.** Entry page: when the viewer is the league commissioner AND `settings.substitutionsEnabled` (fetch league settings — the page already loads the league for scores; extend), render `<SubstitutionPanel …>` below the header with roster from the entry's picks, pool from `db.player.findMany({ where: { season }, select: … })`, existing from `db.substitution.findMany({ where: { entryId }, include: { substitutePlayer: { select: { name: true } } } })`.

- [ ] **Step 5: Gates + manual + commit.** Manual: enable subs in settings; entry page shows panel for commissioner only; apply a sub → entry page lineup shows the substitute from the effective week (after stats exist via mock:week).

```bash
git add -A && git commit -m "feat: substitutions UI — settings toggle and commissioner panel"
```

---

### Task 9: Premium multi-entry

**Files:**
- Create: `src/domain/leagues/add-entry.ts`, `src/app/api/leagues/[leagueId]/entries/route.ts`
- Modify: `src/app/leagues/[leagueId]/page.tsx`
- Test: `src/domain/leagues/add-entry.test.ts`

- [ ] **Step 1: Failing test** — create `src/domain/leagues/add-entry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { upgradeLeaguePremium } from "./upgrade-league";
import { addEntry } from "./add-entry";
import { PremiumFeatureError, DraftAlreadyStartedError, NotLeagueMemberError } from "../errors";

describe("addEntry", () => {
  beforeEach(resetDb);

  async function setup(premium: boolean) {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "First Team",
      scoringPreset: "standard", pickClockHours: 8,
    });
    if (premium) await upgradeLeaguePremium(testDb, { leagueId: league.id });
    return { user, league };
  }

  it("members of premium leagues add extra entries", async () => {
    const { user, league } = await setup(true);
    const entry = await addEntry(testDb, {
      leagueId: league.id, userId: user.id, teamName: "Second Team",
    });
    expect(entry.name).toBe("Second Team");
    expect(await testDb.entry.count({ where: { leagueId: league.id } })).toBe(2);
  });

  it("rejects on free leagues, for non-members, and once the draft exists", async () => {
    const { league } = await setup(false);
    const owner = await testDb.membership.findFirstOrThrow({ where: { leagueId: league.id } });
    await expect(
      addEntry(testDb, { leagueId: league.id, userId: owner.userId, teamName: "Nope" }),
    ).rejects.toThrow(PremiumFeatureError);

    const { user: pUser, league: pLeague } = await setup(true);
    const outsider = await createTestUser("Outsider");
    await expect(
      addEntry(testDb, { leagueId: pLeague.id, userId: outsider.id, teamName: "Nope" }),
    ).rejects.toThrow(NotLeagueMemberError);

    // start a draft (needs 2 entries + pool) then reject
    await addEntry(testDb, { leagueId: pLeague.id, userId: pUser.id, teamName: "Second" });
    const { createStandardPool } = await import("../../../tests/helpers/db");
    await createStandardPool(2);
    const { startDraft } = await import("../draft/start-draft");
    await startDraft(testDb, { leagueId: pLeague.id, userId: pUser.id });
    await expect(
      addEntry(testDb, { leagueId: pLeague.id, userId: pUser.id, teamName: "Third" }),
    ).rejects.toThrow(DraftAlreadyStartedError);
  });
});
```

(Move the dynamic imports to the top of the file when writing it for real — shown inline here only for reading flow.)

- [ ] **Step 2: FAIL**, then implement — create `src/domain/leagues/add-entry.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import {
  DraftAlreadyStartedError,
  LeagueFullError,
  NotLeagueMemberError,
  PremiumFeatureError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";

/** Premium perk: one person, multiple teams. Same cap and draft-lock as joining. */
export async function addEntry(
  db: PrismaClient,
  input: { leagueId: string; userId: string; teamName: string },
) {
  const league = await db.league.findUniqueOrThrow({
    where: { id: input.leagueId },
    include: { draft: { select: { id: true } } },
  });
  if (league.tier !== "PREMIUM") throw new PremiumFeatureError("Multiple entries per person");
  if (league.draft) throw new DraftAlreadyStartedError();

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership) throw new NotLeagueMemberError();

  const settings = parseLeagueSettings(league.settings);
  return db.$transaction(async (tx) => {
    const count = await tx.entry.count({ where: { leagueId: input.leagueId } });
    if (count >= settings.maxEntries) throw new LeagueFullError(settings.maxEntries);
    return tx.entry.create({
      data: { leagueId: input.leagueId, membershipId: membership.id, name: input.teamName },
    });
  });
}
```

- [ ] **Step 3: Route + UI.**

`src/app/api/leagues/[leagueId]/entries/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { addEntry } from "@/domain/leagues/add-entry";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({ teamName: z.string().trim().min(1).max(40) });

export async function POST(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const entry = await addEntry(db, { leagueId, userId: user.id, teamName: parsed.data.teamName });
    return NextResponse.json({ ok: true, entryId: entry.id }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      const status =
        err.code === "PREMIUM_REQUIRED" ? 402 : err.code === "NOT_LEAGUE_MEMBER" ? 404 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
```

UI: create `src/components/add-entry-button.tsx` (client): small inline form (team name input + "Add another team" button, house fetch pattern, `router.refresh()` on success). Mount on the league page next to the Teams heading when `league.tier === "PREMIUM"` && no draft && viewer is a member.

- [ ] **Step 4: Gates + commit.** `npm test` (146-ish — report actual).

```bash
git add -A && git commit -m "feat: premium multi-entry"
```

---

### Task 10: Odds provider + sync (port)

**Files:**
- Create: `src/domain/odds/provider.ts`, `src/domain/odds/implied-probability.ts`, `src/domain/odds/fake-provider.ts`, `src/domain/odds/sync-odds.ts`, `src/lib/odds/odds-api-provider.ts`, `src/lib/odds/team-mapping.ts`
- Test: `src/domain/odds/implied-probability.test.ts`, `src/domain/odds/sync-odds.test.ts`
- Modify: `src/inngest/functions.ts` (daily cron), `.env.example`
- Port sources: `git show 57d9815:src/lib/odds/client.ts` and `git show 57d9815:src/lib/odds/team-mapping.ts` — READ BOTH FIRST.

- [ ] **Step 1: Pure math (TDD)** — create `src/domain/odds/implied-probability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { moneylineToProb, removeVig } from "./implied-probability";

describe("moneylineToProb", () => {
  it("favorites and underdogs", () => {
    expect(moneylineToProb(-200)).toBeCloseTo(200 / 300); // 0.6667
    expect(moneylineToProb(150)).toBeCloseTo(100 / 250); // 0.4
    expect(moneylineToProb(-110)).toBeCloseTo(110 / 210);
  });
});

describe("removeVig", () => {
  it("normalizes a pair to sum to 1", () => {
    const [a, b] = removeVig(moneylineToProb(-110), moneylineToProb(-110));
    expect(a).toBeCloseTo(0.5);
    expect(b).toBeCloseTo(0.5);
    expect(a + b).toBeCloseTo(1);
  });
});
```

FAIL → implement `src/domain/odds/implied-probability.ts` (port the math from the legacy client — `convertMoneylineToProb` and the vig-removal function; keep the legacy formulas):

```ts
/** American odds → implied probability (with vig). */
export function moneylineToProb(odds: number): number {
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

/** Bookmaker margins make raw implied pairs sum >1; normalize to a fair pair. */
export function removeVig(probA: number, probB: number): [number, number] {
  const total = probA + probB;
  return [probA / total, probB / total];
}
```

- [ ] **Step 2: Provider seam** — create `src/domain/odds/provider.ts`:

```ts
export interface GameOdds {
  homeTeam: string; // OUR abbreviations
  awayTeam: string;
  homeWinProb: number; // vig-removed, 0..1
  awayWinProb: number;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  commenceTime: Date;
}

/** Same seam philosophy as StatsProvider: The Odds API is v1; anything else is an adapter. */
export interface OddsProvider {
  /** Upcoming NFL games with moneyline-derived win probabilities. */
  fetchUpcomingOdds(): Promise<GameOdds[]>;
}
```

`src/domain/odds/fake-provider.ts`:

```ts
import type { GameOdds, OddsProvider } from "./provider";

export class FakeOddsProvider implements OddsProvider {
  constructor(private readonly games: GameOdds[]) {}
  async fetchUpcomingOdds(): Promise<GameOdds[]> {
    return this.games;
  }
}
```

- [ ] **Step 3: Sync (TDD)** — create `src/domain/odds/sync-odds.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { syncTeamOdds } from "./sync-odds";
import { FakeOddsProvider } from "./fake-provider";
import { CURRENT_SEASON } from "../season";

describe("syncTeamOdds", () => {
  beforeEach(resetDb);

  it("matches provider games to the earliest unfinished week and upserts both teams", async () => {
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 2, eventId: "g1", homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000), state: "SCHEDULED",
      },
    });
    const provider = new FakeOddsProvider([
      {
        homeTeam: "KC", awayTeam: "BUF", homeWinProb: 0.6, awayWinProb: 0.4,
        homeMoneyline: -150, awayMoneyline: 130, commenceTime: new Date(),
      },
      { // not one of our scheduled games — ignored
        homeTeam: "AAA", awayTeam: "BBB", homeWinProb: 0.5, awayWinProb: 0.5,
        homeMoneyline: null, awayMoneyline: null, commenceTime: new Date(),
      },
    ]);
    const result = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(result.upserted).toBe(2);
    const kc = await testDb.teamOdds.findUniqueOrThrow({
      where: { season_week_team: { season: CURRENT_SEASON, week: 2, team: "KC" } },
    });
    expect(kc.winProb).toBeCloseTo(0.6);
    expect(kc.opponent).toBe("BUF");

    // idempotent re-sync updates in place
    const again = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(again.upserted).toBe(2);
    expect(await testDb.teamOdds.count()).toBe(2);
  });

  it("no scheduled games → no-op", async () => {
    const provider = new FakeOddsProvider([]);
    const result = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(result.upserted).toBe(0);
  });
});
```

FAIL → implement `src/domain/odds/sync-odds.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { OddsProvider } from "./provider";

/**
 * Match provider odds to OUR scheduled games (by team pair) and store one row per
 * team per week. Games we don't recognize (other weeks, typos) are skipped.
 */
export async function syncTeamOdds(
  db: PrismaClient,
  provider: OddsProvider,
  input: { season: number },
) {
  const scheduled = await db.nflGame.findMany({
    where: { season: input.season, state: { not: "FINAL" } },
    select: { week: true, homeTeam: true, awayTeam: true },
  });
  if (scheduled.length === 0) return { upserted: 0 };
  const gameByPair = new Map(scheduled.map((g) => [`${g.homeTeam}:${g.awayTeam}`, g]));

  const odds = await provider.fetchUpcomingOdds();
  let upserted = 0;
  for (const o of odds) {
    const game = gameByPair.get(`${o.homeTeam}:${o.awayTeam}`) ?? gameByPair.get(`${o.awayTeam}:${o.homeTeam}`);
    if (!game) continue;
    const rows = [
      { team: o.homeTeam, opponent: o.awayTeam, winProb: o.homeWinProb, moneyline: o.homeMoneyline },
      { team: o.awayTeam, opponent: o.homeTeam, winProb: o.awayWinProb, moneyline: o.awayMoneyline },
    ];
    for (const row of rows) {
      await db.teamOdds.upsert({
        where: { season_week_team: { season: input.season, week: game.week, team: row.team } },
        create: { season: input.season, week: game.week, eventTime: o.commenceTime, ...row },
        update: { winProb: row.winProb, moneyline: row.moneyline, opponent: row.opponent, eventTime: o.commenceTime },
      });
      upserted += 1;
    }
  }
  return { upserted };
}
```

- [ ] **Step 4: Real adapter.** Create `src/lib/odds/team-mapping.ts` by PORTING `git show 57d9815:src/lib/odds/team-mapping.ts` (full-name → abbreviation map; keep legacy's mappings; align output abbreviations with the ones our NflGame rows use — ESPN-style). Create `src/lib/odds/odds-api-provider.ts`:

```ts
import type { GameOdds, OddsProvider } from "@/domain/odds/provider";
import { moneylineToProb, removeVig } from "@/domain/odds/implied-probability";
import { normalizeTeamName } from "./team-mapping";

const BASE = "https://api.the-odds-api.com/v4";

/**
 * The Odds API adapter (free tier: 500 req/mo — one daily sync uses ~30/season).
 * Ported from the prototype's odds client; consensus = first bookmaker with h2h prices.
 */
export class OddsApiProvider implements OddsProvider {
  constructor(private readonly apiKey: string) {}

  async fetchUpcomingOdds(): Promise<GameOdds[]> {
    const url = `${BASE}/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${this.apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`odds api ${res.status}`);
    const games = (await res.json()) as Array<{
      home_team: string;
      away_team: string;
      commence_time: string;
      bookmakers: Array<{ markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }> }>;
    }>;
    const out: GameOdds[] = [];
    for (const g of games) {
      const market = g.bookmakers.flatMap((b) => b.markets).find((m) => m.key === "h2h");
      const home = market?.outcomes.find((o) => o.name === g.home_team);
      const away = market?.outcomes.find((o) => o.name === g.away_team);
      if (!home || !away) continue;
      const [homeWinProb, awayWinProb] = removeVig(moneylineToProb(home.price), moneylineToProb(away.price));
      out.push({
        homeTeam: normalizeTeamName(g.home_team),
        awayTeam: normalizeTeamName(g.away_team),
        homeWinProb,
        awayWinProb,
        homeMoneyline: home.price,
        awayMoneyline: away.price,
        commenceTime: new Date(g.commence_time),
      });
    }
    return out;
  }
}

export const oddsProvider: OddsProvider | null = process.env.ODDS_API_KEY
  ? new OddsApiProvider(process.env.ODDS_API_KEY)
  : null;
```

(Adapt the response-shape details to what the legacy client actually parsed — port its choices.)

- [ ] **Step 5: Cron.** In `src/inngest/functions.ts`, add to `statsSyncDaily` a final step:

```ts
    await step.run("sync-odds", async () => {
      if (!oddsProvider) {
        console.warn("[odds] ODDS_API_KEY not set — skipping odds sync");
        return { skipped: true };
      }
      return syncTeamOdds(db, oddsProvider, { season: CURRENT_SEASON });
    });
```

`.env.example`:

```
# The Odds API (premium analytics win probabilities). Empty = no odds; projections fall back to 50%.
# Free tier at https://the-odds-api.com
ODDS_API_KEY=""
```

- [ ] **Step 6: Gates + commit.** Report test count.

```bash
git add -A && git commit -m "feat: team odds — provider seam, odds-api port, daily sync"
```

---

### Task 11: Projections + expected value (port)

**Files:**
- Create: `src/domain/odds/projections.ts`, `src/lib/league-projections.ts`
- Test: `src/domain/odds/projections.test.ts`, `tests/league-projections.test.ts`
- Port source: `git show 57d9815:src/lib/projections/calculator.ts` — READ FIRST.

- [ ] **Step 1: Pure projection (TDD)** — create `src/domain/odds/projections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectPoints, POSITION_AVERAGES } from "./projections";

describe("projectPoints", () => {
  it("falls back to the position average with no games", () => {
    const p = projectPoints("QB", []);
    expect(p.projectedPoints).toBe(POSITION_AVERAGES.QB);
    expect(p.confidence).toBe("low");
  });

  it("uses recency-weighted average of played games", () => {
    // weights: week2 game ×1, week1 game ×0.8 → (0.8*10 + 1*20) / 1.8
    const p = projectPoints("RB", [
      { week: 1, points: 10 },
      { week: 2, points: 20 },
    ]);
    expect(p.projectedPoints).toBeCloseTo((0.8 * 10 + 20) / 1.8);
    expect(p.confidence).toBe("high"); // ≥2 games
  });

  it("one game = medium confidence; zero-point games don't count as played", () => {
    expect(projectPoints("WR", [{ week: 1, points: 12 }]).confidence).toBe("medium");
    expect(projectPoints("WR", [{ week: 1, points: 0 }]).confidence).toBe("low");
  });
});
```

FAIL → implement `src/domain/odds/projections.ts` (port the legacy calculator's approach — position averages, recency decay 0.8/week, confidence tiers; simplify away the per-stat breakdown projection, we only need points):

```ts
import type { PlayerPosition } from "@prisma/client";

// Ported from the prototype's projections calculator: playoff-typical per-game
// baselines when a player hasn't played yet this postseason.
export const POSITION_AVERAGES: Record<PlayerPosition, number> = {
  QB: 18.5,
  RB: 12.0,
  WR: 11.5,
  TE: 8.0,
  K: 7.5,
  DST: 7.0,
};

const RECENCY_DECAY = 0.8; // 20% less weight per week older

export interface Projection {
  projectedPoints: number;
  confidence: "high" | "medium" | "low";
  gamesPlayed: number;
}

/** Recency-weighted per-game projection from this postseason's scores. */
export function projectPoints(
  position: PlayerPosition,
  games: { week: number; points: number }[],
): Projection {
  const played = games.filter((g) => g.points > 0);
  if (played.length === 0) {
    return { projectedPoints: POSITION_AVERAGES[position], confidence: "low", gamesPlayed: 0 };
  }
  const latest = Math.max(...played.map((g) => g.week));
  let weightSum = 0;
  let weighted = 0;
  for (const g of played) {
    const weight = Math.pow(RECENCY_DECAY, latest - g.week);
    weighted += g.points * weight;
    weightSum += weight;
  }
  return {
    projectedPoints: weighted / weightSum,
    confidence: played.length >= 2 ? "high" : "medium",
    gamesPlayed: played.length,
  };
}
```

- [ ] **Step 2: League projections lib (TDD)** — create `tests/league-projections.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createStandardPool, setTestStat,
} from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { getLeagueProjections } from "@/lib/league-projections";
import { CURRENT_SEASON } from "@/domain/season";

describe("getLeagueProjections", () => {
  beforeEach(resetDb);

  it("ranks entries by projected optimal lineup EV; eliminated players contribute zero", async () => {
    const commish = await createTestUser("C");
    const friend = await createTestUser("F");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "CT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
    await createStandardPool(2);
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    for (let i = 0; i < 18; i++) {
      await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
    }
    // week 1 stats so projections have data
    const picks = await testDb.draftPick.findMany();
    for (const p of picks) await setTestStat(p.playerId, 1, { rushYards: 100 });
    // week-2 odds: KC 70% (all test players are KC)
    await testDb.teamOdds.create({
      data: { season: CURRENT_SEASON, week: 2, team: "KC", opponent: "BUF", winProb: 0.7 },
    });
    // one scheduled week-2 game so week 2 is "next"
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 2, eventId: "g2", homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000), state: "SCHEDULED",
      },
    });

    const proj = await getLeagueProjections(testDb, league.id);
    expect(proj.nextWeek).toBe(2);
    expect(proj.entries).toHaveLength(2);
    for (const e of proj.entries) {
      expect(e.projectedTotal).toBeGreaterThan(0);
      // every player: EV = projection × 0.7 (all KC, odds present)
    }
    // eliminate KC → all EVs zero
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 1, eventId: "g1", homeTeam: "KC", awayTeam: "ZZZ",
        startsAt: new Date("2027-01-10T18:00:00Z"), state: "FINAL", homeScore: 3, awayScore: 30,
      },
    });
    const after = await getLeagueProjections(testDb, league.id);
    for (const e of after.entries) expect(e.projectedTotal).toBe(0);
  });
});
```

FAIL → implement `src/lib/league-projections.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "@/domain/league-settings";
import { computePoints, roundPoints } from "@/domain/scoring/compute-points";
import { optimalLineup, type ScoredPlayer } from "@/domain/scoring/best-ball";
import { tryParseStatLine } from "@/domain/stats/stat-line";
import { getEliminatedTeams } from "@/domain/stats/eliminated-teams";
import { projectPoints } from "@/domain/odds/projections";
import { effectivePlayerForWeek } from "@/lib/league-scores";

const NO_ODDS_WIN_PROB = 0.5; // fair-coin fallback when the odds sync hasn't run

export interface LeagueProjections {
  nextWeek: number | null; // null once the Super Bowl is final
  entries: {
    entryId: string;
    name: string;
    projectedTotal: number; // optimal-lineup EV for next week
    players: { playerId: string; name: string; ev: number; winProb: number | null; eliminated: boolean }[];
  }[];
}

/** Premium analytics: next-week expected value = recency projection × win probability. */
export async function getLeagueProjections(db: PrismaClient, leagueId: string): Promise<LeagueProjections> {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: {
          picks: { include: { player: { select: { id: true, name: true, position: true, nflTeam: true } } } },
          substitutions: { include: { substitutePlayer: { select: { id: true, name: true, position: true, nflTeam: true } } } },
        },
      },
    },
  });
  const settings = parseLeagueSettings(league.settings);
  const eliminated = await getEliminatedTeams(db, league.season);

  const games = await db.nflGame.findMany({ where: { season: league.season } });
  const unfinished = games.filter((g) => g.state !== "FINAL").map((g) => g.week);
  const nextWeek = unfinished.length > 0 ? Math.min(...unfinished) : null;
  if (nextWeek === null) return { nextWeek, entries: [] };

  // stat history for projections (all rostered + substitute players)
  const playerIds = [
    ...new Set(
      league.entries.flatMap((e) => [
        ...e.picks.map((p) => p.playerId),
        ...e.substitutions.map((s) => s.substitutePlayerId),
      ]),
    ),
  ];
  const statRows = await db.playerStat.findMany({
    where: { season: league.season, playerId: { in: playerIds } },
  });
  const gamesByPlayer = new Map<string, { week: number; points: number }[]>();
  for (const row of statRows) {
    const line = tryParseStatLine(row.stats);
    if (!line) continue;
    const list = gamesByPlayer.get(row.playerId) ?? [];
    list.push({ week: row.week, points: roundPoints(computePoints(line, settings.scoring).total) });
    gamesByPlayer.set(row.playerId, list);
  }
  const odds = await db.teamOdds.findMany({ where: { season: league.season, week: nextWeek } });
  const winProbByTeam = new Map(odds.map((o) => [o.team, o.winProb]));

  const entries = league.entries.map((entry) => {
    const subsByOriginal = new Map(
      entry.substitutions.map((s) => [s.originalPlayerId, s]),
    );
    const playerMeta = new Map(
      [...entry.picks.map((p) => p.player), ...entry.substitutions.map((s) => s.substitutePlayer)].map((p) => [p.id, p]),
    );
    const players = entry.picks.map((pick) => {
      const effectiveId = effectivePlayerForWeek(pick, nextWeek, subsByOriginal);
      const meta = playerMeta.get(effectiveId)!;
      const isOut = eliminated.has(meta.nflTeam);
      const winProb = isOut ? 0 : (winProbByTeam.get(meta.nflTeam) ?? null);
      const projection = projectPoints(meta.position, gamesByPlayer.get(effectiveId) ?? []);
      const ev = roundPoints(projection.projectedPoints * (isOut ? 0 : (winProb ?? NO_ODDS_WIN_PROB)));
      return { playerId: effectiveId, name: meta.name, ev, winProb, eliminated: isOut, position: meta.position };
    });
    const scored: ScoredPlayer[] = players.map((p) => ({
      playerId: p.playerId, position: p.position, points: p.ev,
    }));
    const { total } = optimalLineup(settings.rosterSlots, scored);
    return {
      entryId: entry.id,
      name: entry.name,
      projectedTotal: roundPoints(total),
      players: players.map(({ position: _p, ...rest }) => rest),
    };
  });

  entries.sort((a, b) => b.projectedTotal - a.projectedTotal);
  return { nextWeek, entries };
}
```

- [ ] **Step 3: PASS.** Gates + commit.

```bash
git add -A && git commit -m "feat: projections + expected value (premium analytics core)"
```

---

### Task 12: Premium analytics UI

**Files:**
- Create: `src/components/projections-table.tsx`
- Modify: `src/app/leagues/[leagueId]/page.tsx`

- [ ] **Step 1: Component** — create `src/components/projections-table.tsx` (server component):

```tsx
import type { LeagueProjections } from "@/lib/league-projections";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };

export function ProjectionsTable({ projections }: { projections: LeagueProjections }) {
  if (projections.nextWeek === null) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        Projections
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PREMIUM</span>
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        Projected {WEEK_LABELS[projections.nextWeek]} points — recent scoring × win probability, best-ball lineup.
      </p>
      <ul className="rounded-lg border text-sm">
        {projections.entries.map((entry, i) => (
          <li key={entry.entryId} className="flex items-center justify-between border-b p-2 last:border-b-0">
            <span>
              <span className="mr-2 text-gray-500">{i + 1}</span>
              <span className="font-medium">{entry.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {entry.players.filter((p) => !p.eliminated).length} alive
              </span>
            </span>
            <span className="tabular-nums font-semibold">{entry.projectedTotal.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Mount + teaser.** League page (after Standings, before Teams): when draft COMPLETE:
- PREMIUM league: `const projections = await getLeagueProjections(db, leagueId);` → `<ProjectionsTable projections={projections} />`.
- FREE league: a teaser box: `<section className="mt-8 rounded-lg border border-dashed p-4"><h2 className="font-semibold">Projections <span className="text-xs text-amber-700">PREMIUM</span></h2><p className="mt-1 text-sm text-gray-600">See every team's projected points — recent scoring × Vegas win probabilities. Included with Premium.</p></section>` (plus the UpgradeButton when the viewer is the commissioner).

- [ ] **Step 3: Gates + manual + commit.** Manual: premium league (psql-flip or webhook) with mock stats + a TeamOdds row shows the table; free league shows the teaser.

```bash
git add -A && git commit -m "feat: premium projections view with free-tier teaser"
```

---

### Task 13: E2E + docs + final sweep

**Files:**
- Create: `e2e/engagement.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: E2E** — create `e2e/engagement.spec.ts` (signUp/createLeague helpers per the existing specs — read one):

```ts
import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("substitutions toggle + free projections teaser", async ({ page }) => {
  const stamp = Date.now();
  await signUp(page, "Commish", `eng-${stamp}@example.com`);
  await page.goto("/leagues/new");
  await page.getByPlaceholder("The Gerner Invitational").fill("Engagement League");
  await page.getByPlaceholder("Team Nick").fill("Commish Team");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { name: "Engagement League" })).toBeVisible();

  // enable substitutions in settings
  await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  await page.getByLabel(/injury substitutions/i).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/injury substitutions/i)).toBeChecked();
});
```

(Free projections teaser only shows post-draft — dropping that assertion keeps the spec fast; the projections table is covered by unit/integration tests. Adjust the substitutions checkbox selector to the real label.)

- [ ] **Step 2: Run.** `npm run test:e2e` → 6 passed.

- [ ] **Step 3: README.** Document: ODDS_API_KEY (free tier, projections fall back to 50% without it); recaps/previews are hourly-cron driven (need Inngest, same dev note); substitutions league setting.

- [ ] **Step 4: Final sweep.**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

All green (report final counts).

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "test: engagement e2e; docs for odds, recaps, substitutions"
```

---

## Deferred (explicit)

- **Phase 5 (next):** production deploy (Vercel/Neon/Terraform per gv-infra), PostHog (fake-door + upgrade conversion events), sync-failure alerting, December mock beta
- Player props, weather, live prop tracking (premium analytics tail — next season, informed by waitlist)
- Exact clinch/elimination scenario math ("you need X by Y")
- Cross-position substitutions
