import { describe, expect, it } from "vitest";
import { listCapturedSeasons, loadSeasonSnapshot } from "./season-snapshot";
import { createHistoricalSource } from "@/domain/stats/sources/historical-source";
import { DEFAULT_ROSTER_SLOTS } from "@/domain/league-settings";
import type { PlayerPosition } from "@prisma/client";

// Guards the COMMITTED capture files. The capture script asserts these at write
// time, but it talks to the network and is run by hand; this re-checks them in CI
// so a truncated or hand-edited snapshot cannot ship silently.

const seasons = listCapturedSeasons();
const EXPECTED_GAMES: Record<number, number> = { 1: 6, 2: 4, 3: 2, 4: 1 };
const TARGET_ENTRIES = 12;

describe("captured seasons", () => {
  it("has at least one season on disk", () => {
    expect(seasons.length).toBeGreaterThan(0);
  });

  it.each(seasons)("season %i parses and is internally consistent", (year) => {
    const snapshot = loadSeasonSnapshot(year);
    expect(snapshot.capturedSeason).toBe(year);
    expect(snapshot.teams).toHaveLength(14);

    for (const [week, expected] of Object.entries(EXPECTED_GAMES)) {
      const games = snapshot.weeks.find((w) => w.week === Number(week))?.games ?? [];
      expect(games).toHaveLength(expected);
    }

    for (const { games } of snapshot.weeks) {
      for (const g of games) {
        // Every playoff game has a loser — getEliminatedTeams depends on it.
        expect(g.homeScore).not.toBe(g.awayScore);
        const lines = snapshot.stats[g.eventId] ?? [];
        expect(lines.length).toBeGreaterThanOrEqual(18);
        expect(lines.filter((l) => l.position === "DST")).toHaveLength(2);
      }
    }
  });

  it.each(seasons)("season %i: every stat line resolves to a pool player", (year) => {
    // An orphan line is points that vanish: syncWeekStats reports it `unmatched`
    // and writes nothing, so the player scores zero on the demo leaderboard.
    const snapshot = loadSeasonSnapshot(year);
    const poolIds = new Set(snapshot.pool.map((p) => p.externalId));
    for (const lines of Object.values(snapshot.stats)) {
      for (const l of lines) expect(poolIds.has(l.externalId)).toBe(true);
    }
  });

  it.each(seasons)("season %i: pool can fill 12 standard rosters", (year) => {
    // startDraftForLeague refuses to start otherwise, so the demo's premium
    // league would be undraftable.
    const snapshot = loadSeasonSnapshot(year);
    const counts = new Map<PlayerPosition, number>();
    for (const p of snapshot.pool) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);

    let flexSurplus = 0;
    for (const slot of ["QB", "RB", "WR", "TE", "K", "DST"] as const) {
      const need = DEFAULT_ROSTER_SLOTS.filter((s) => s.slot === slot).length * TARGET_ENTRIES;
      const have = counts.get(slot) ?? 0;
      expect(have).toBeGreaterThanOrEqual(need);
      if (slot === "RB" || slot === "WR" || slot === "TE") flexSurplus += have - need;
    }
    const flexNeed = DEFAULT_ROSTER_SLOTS.filter((s) => s.slot === "FLEX").length * TARGET_ENTRIES;
    expect(flexSurplus).toBeGreaterThanOrEqual(flexNeed);
  });

  it.each(seasons)("season %i: kickers have field goals", (year) => {
    // FG distances come from the drives subtree, which thins out for older
    // seasons. Without them kickers score nothing and the K slot is dead weight.
    const snapshot = loadSeasonSnapshot(year);
    const madeFgs = Object.values(snapshot.stats)
      .flat()
      .reduce((n, l) => n + l.stats.fgMade.length, 0);
    expect(madeFgs).toBeGreaterThan(10);
  });
});

describe("createHistoricalSource", () => {
  const year = seasons[0];
  const now = new Date("2026-08-29T18:00:00.000Z");

  it("emits all four weeks with the played/upcoming split", () => {
    const source = createHistoricalSource(loadSeasonSnapshot(year));
    const data = source.seasonData({ playedThroughWeek: 2, now, season: 2026 });
    expect(data.games).toHaveLength(13);
    for (const g of data.games) {
      expect(g.state).toBe(g.week <= 2 ? "FINAL" : "SCHEDULED");
      expect(g.startsAt.getTime() > now.getTime()).toBe(g.state === "SCHEDULED");
    }
  });

  it("prefixes event ids so the season's source is detectable", () => {
    const source = createHistoricalSource(loadSeasonSnapshot(year));
    const data = source.seasonData({ playedThroughWeek: 4, now, season: 2026 });
    for (const g of data.games) expect(g.eventId.startsWith(`h${year}-`)).toBe(true);
  });

  it("keeps each game's real offset within its round", () => {
    // A round's games are spread across a weekend; collapsing them onto one
    // instant would make the schedule read as obviously fake.
    const source = createHistoricalSource(loadSeasonSnapshot(year));
    const data = source.seasonData({ playedThroughWeek: 0, now, season: 2026 });
    const wildCard = data.games.filter((g) => g.week === 1).map((g) => g.startsAt.getTime());
    expect(new Set(wildCard).size).toBeGreaterThan(1);
  });

  it("hides scores for games that have not been played", () => {
    const source = createHistoricalSource(loadSeasonSnapshot(year));
    const data = source.seasonData({ playedThroughWeek: 1, now, season: 2026 });
    for (const g of data.games.filter((g) => g.state === "SCHEDULED")) {
      expect(g.homeScore).toBe(0);
      expect(g.awayScore).toBe(0);
      expect(data.stats[g.eventId]).toEqual([]);
    }
  });

  it("ranks the pool contiguously and deterministically", () => {
    const source = createHistoricalSource(loadSeasonSnapshot(year));
    const a = source.defaultRanks();
    const b = source.defaultRanks();
    expect(a).toEqual(b);
    expect(a.map((r) => r.defaultRank).sort((x, y) => x - y)).toEqual(
      a.map((_, i) => i + 1),
    );
  });

  it("ranks productive players ahead of unproductive ones, but not perfectly", () => {
    // Jitter is deliberate: a board ranked exactly by what players went on to
    // score gives autodraft hindsight and reads as fake.
    const snapshot = loadSeasonSnapshot(year);
    const source = createHistoricalSource(snapshot);
    const rankById = new Map(source.defaultRanks().map((r) => [r.externalId, r.defaultRank]));

    const scored = new Map<string, number>();
    for (const lines of Object.values(snapshot.stats)) {
      for (const l of lines) {
        const pts = l.stats.rushYards / 10 + l.stats.recYards / 10 + l.stats.passYards / 30;
        scored.set(l.externalId, (scored.get(l.externalId) ?? 0) + pts);
      }
    }
    const best = [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const unscored = snapshot.pool.filter((p) => !scored.has(p.externalId));
    if (unscored.length > 0) {
      const medianTop = Math.max(...best.map(([id]) => rankById.get(id)!));
      const bestUnscored = Math.min(...unscored.map((p) => rankById.get(p.externalId)!));
      expect(medianTop).toBeLessThan(bestUnscored);
    }
  });
});
