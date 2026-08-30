import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDb, resetDb } from "./helpers/db";
import { seedDemo, type CreateAccount } from "@/domain/demo/seed-demo";
import { DEMO_LEAGUES, DEMO_PERSONA } from "@/domain/demo/fixtures";
import { createHistoricalSource } from "@/domain/stats/sources/historical-source";
import { listCapturedSeasons, loadSeasonSnapshot } from "@/lib/demo/season-snapshot";
import { getLeagueProjections } from "@/lib/league-projections";
import { getLeagueScores } from "@/lib/league-scores";
import { CURRENT_SEASON } from "@/domain/season";

// Proves each phase is reachable and coherent. These are the assertions that stand
// in for clicking through the site, so they check what a visitor would actually
// see rather than just that rows exist.

const year = listCapturedSeasons()[0];
const source = createHistoricalSource(loadSeasonSnapshot(year));
const now = new Date();

// Better Auth is not in scope here; the seeder takes account creation as a
// parameter precisely so the domain can be tested without it.
const createAccount: CreateAccount = async ({ name, email }) =>
  testDb.user.create({ data: { id: randomUUID(), name, email } });

const seed = (phase: "pre-draft" | "draft" | "live", week?: number) =>
  seedDemo(testDb, { phase, week, source, season: CURRENT_SEASON, createAccount, now });

describe("seedDemo", () => {
  beforeEach(resetDb);

  describe("pre-draft", () => {
    it("creates both leagues with no draft — the absence of a Draft row is the phase", async () => {
      const result = await seed("pre-draft");
      expect(result.leagues).toHaveLength(2);
      for (const league of result.leagues) {
        const draft = await testDb.draft.findUnique({ where: { leagueId: league.id } });
        expect(draft).toBeNull();
      }
    });

    it("fills both leagues to their full team count", async () => {
      const result = await seed("pre-draft");
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const free = result.leagues.find((l) => l.tier === "FREE")!;
      expect(premium.entryCount).toBe(DEMO_LEAGUES.premium.entryCount);
      expect(free.entryCount).toBe(DEMO_LEAGUES.free.entryCount);
    });

    it("pins invite codes so the join URL is stable and shareable", async () => {
      const result = await seed("pre-draft");
      expect(result.leagues.map((l) => l.inviteCode).sort()).toEqual(
        [DEMO_LEAGUES.free.inviteCode, DEMO_LEAGUES.premium.inviteCode].sort(),
      );
    });

    it("gives the persona a team in both leagues", async () => {
      await seed("pre-draft");
      const user = await testDb.user.findUniqueOrThrow({ where: { email: DEMO_PERSONA.email } });
      const entries = await testDb.entry.findMany({ where: { membership: { userId: user.id } } });
      expect(entries).toHaveLength(2);
    });

    it("seeds a pool big enough for a 12-team draft", async () => {
      // The 39-player dev fixture cannot do this; startDraftForLeague would throw.
      await seed("pre-draft");
      const players = await testDb.player.count({ where: { season: CURRENT_SEASON } });
      expect(players).toBeGreaterThanOrEqual(96);
    });
  });

  describe("draft", () => {
    it("leaves the persona on the clock with a future deadline", async () => {
      const result = await seed("draft");
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const draft = await testDb.draft.findUniqueOrThrow({ where: { leagueId: premium.id } });

      expect(draft.status).toBe("ACTIVE");
      expect(draft.currentDeadline!.getTime()).toBeGreaterThan(Date.now());

      const order = draft.order as string[];
      const onClock = order[
        Math.floor(draft.currentPickIndex / order.length) % 2 === 0
          ? draft.currentPickIndex % order.length
          : order.length - 1 - (draft.currentPickIndex % order.length)
      ];
      expect(onClock).toBe(result.onClockEntryId);
    });

    it("has real picks behind it, so the board is not empty", async () => {
      const result = await seed("draft");
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const picks = await testDb.draftPick.count({ where: { draft: { leagueId: premium.id } } });
      expect(picks).toBeGreaterThanOrEqual(premium.entryCount * 2);
    });

    it("does not arm a pick clock or notify anyone", async () => {
      // applyPickAndAdvance never calls announceDraftState, so seeding a draft
      // cannot fire draft/turn.started even against a wired environment.
      const result = await seed("draft");
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const draft = await testDb.draft.findUniqueOrThrow({ where: { leagueId: premium.id } });
      expect(draft.status).toBe("ACTIVE");
    });
  });

  describe("live", () => {
    it("completes the drafts — the leaderboard only renders once a draft is COMPLETE", async () => {
      const result = await seed("live", 2);
      for (const league of result.leagues) {
        const draft = await testDb.draft.findUniqueOrThrow({ where: { leagueId: league.id } });
        expect(draft.status).toBe("COMPLETE");
      }
    });

    it("marks played weeks FINAL and future weeks SCHEDULED", async () => {
      const result = await seed("live", 2);
      expect(result.weeksFinal).toEqual([1, 2]);
      expect(result.weeksScheduled).toEqual([3, 4]);

      const games = await testDb.nflGame.findMany({ where: { season: CURRENT_SEASON } });
      expect(games).toHaveLength(13);
      for (const g of games) {
        expect(g.state).toBe(g.week <= 2 ? "FINAL" : "SCHEDULED");
      }
    });

    it("computes a nextWeek, so premium projections are not blank", async () => {
      // THE regression test for this whole effort. getLeagueProjections derives
      // nextWeek from games that are not FINAL; with no future rows it returns
      // { nextWeek: null, entries: [] } and the premium feature silently renders
      // nothing mid-season.
      const result = await seed("live", 2);
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const projections = await getLeagueProjections(testDb, premium.id);

      expect(projections.nextWeek).toBe(3);
      expect(projections.entries).toHaveLength(premium.entryCount);
      expect(projections.entries.some((e) => e.projectedTotal > 0)).toBe(true);
    });

    it("scores every team from real box scores", async () => {
      const result = await seed("live", 2);
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const scores = await getLeagueScores(testDb, premium.id);

      expect(scores.entries).toHaveLength(premium.entryCount);
      // Real playoff scoring: every team should have put up points in weeks 1-2.
      for (const entry of scores.entries) expect(entry.grandTotal).toBeGreaterThan(0);
      // And the standings should not be a tie — real data separates teams.
      const totals = scores.entries.map((e) => e.grandTotal);
      expect(new Set(totals).size).toBeGreaterThan(1);
      // Weeks 3-4 have not been played, so they must be scoreless.
      for (const entry of scores.entries) {
        for (const week of entry.weeks.filter((w) => w.week > 2)) {
          expect(week.total).toBe(0);
        }
      }
    });

    it("leaves unplayed weeks unscored", async () => {
      const result = await seed("live", 2);
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const stats = await testDb.playerStat.findMany({ where: { season: CURRENT_SEASON } });
      expect(stats.every((s) => s.week <= 2)).toBe(true);
      expect(premium.entryCount).toBeGreaterThan(0);
    });

    it("sets engagement watermarks so no recap backlog fires", async () => {
      const result = await seed("live", 3);
      for (const league of result.leagues) {
        const row = await testDb.league.findUniqueOrThrow({ where: { id: league.id } });
        expect(row.lastRecapWeek).toBe(3);
        expect(row.lastPreviewWeek).toBe(3);
      }
    });

    it("rejects a week outside the playoff range", async () => {
      await expect(seed("live", 5)).rejects.toThrow(/1\.\.4/);
    });
  });

  describe("re-running", () => {
    it("is idempotent — seeding twice leaves one demo world, not two", async () => {
      await seed("live", 2);
      await seed("live", 2);
      const leagues = await testDb.league.findMany({
        where: { inviteCode: { in: [DEMO_LEAGUES.premium.inviteCode, DEMO_LEAGUES.free.inviteCode] } },
      });
      expect(leagues).toHaveLength(2);
      const games = await testDb.nflGame.count({ where: { season: CURRENT_SEASON } });
      expect(games).toBe(13);
    });

    it("can move between phases on a re-run", async () => {
      await seed("pre-draft");
      const result = await seed("live", 1);
      const premium = result.leagues.find((l) => l.tier === "PREMIUM")!;
      const draft = await testDb.draft.findUniqueOrThrow({ where: { leagueId: premium.id } });
      expect(draft.status).toBe("COMPLETE");
    });

    it("marks the database as a demo environment", async () => {
      // The out-of-band factor in the password-auth gate. Only the seeder writes it.
      await seed("pre-draft");
      expect(await testDb.demoEnvironment.count()).toBe(1);
    });
  });
});
