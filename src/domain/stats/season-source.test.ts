import { describe, expect, it } from "vitest";
import { eventIdPrefixFor, parseSourceId, sourceIdForEventId } from "./season-source";
import { createSyntheticSource } from "./sources/synthetic-source";
import type { MockPlayer } from "./mock-season";

const now = new Date("2026-08-29T18:00:00.000Z");
const SEASON = 2026;

const players: MockPlayer[] = [
  { externalId: "p1", name: "Test QB", position: "QB", nflTeam: "KC" },
  { externalId: "p2", name: "Test RB", position: "RB", nflTeam: "BUF" },
  { externalId: "p3", name: "Test K", position: "K", nflTeam: "KC" },
];

describe("parseSourceId", () => {
  it("parses the synthetic id", () => {
    expect(parseSourceId("synthetic")).toEqual({ kind: "synthetic" });
  });

  it("parses a historical id with its season", () => {
    expect(parseSourceId("historical:2024")).toEqual({ kind: "historical", season: 2024 });
  });

  it.each(["", "historical", "historical:", "historical:abc", "nonsense", "historical:20x4"])(
    "rejects %o",
    (bad) => {
      expect(() => parseSourceId(bad)).toThrow();
    },
  );
});

describe("event id prefixes", () => {
  // The prefix is how the database remembers which source owns a season, without
  // a schema column. Mixing two sources in one season would union two brackets.
  it("gives each source a distinct prefix", () => {
    const prefixes = ["synthetic", "historical:2024", "historical:2023"].map((id) =>
      eventIdPrefixFor(id as never),
    );
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("keeps the synthetic prefix as `mock-` for backward compatibility", () => {
    // Existing rows and advanceMockWeek's history use this prefix.
    expect(eventIdPrefixFor("synthetic")).toBe("mock-");
  });

  it("round-trips a prefixed event id back to its source", () => {
    for (const id of ["synthetic", "historical:2024", "historical:2023"] as const) {
      const eventId = `${eventIdPrefixFor(id)}123`;
      expect(sourceIdForEventId(eventId)).toBe(id);
    }
  });

  it("returns null for an event id from no known source", () => {
    expect(sourceIdForEventId("401671878")).toBeNull();
  });
});

describe("createSyntheticSource", () => {
  const source = createSyntheticSource(players);

  it("emits the full four-week bracket, not just played weeks", () => {
    // The bug this exists to prevent: with no rows for future weeks,
    // league-projections computes nextWeek = null and silently renders nothing.
    const data = source.seasonData({ playedThroughWeek: 2, now, season: SEASON });
    expect([...new Set(data.games.map((g) => g.week))].sort()).toEqual([1, 2, 3, 4]);
  });

  it("marks played weeks FINAL and future weeks SCHEDULED", () => {
    const data = source.seasonData({ playedThroughWeek: 2, now, season: SEASON });
    const stateFor = (w: number) => data.games.find((g) => g.week === w)!.state;
    expect(stateFor(1)).toBe("FINAL");
    expect(stateFor(2)).toBe("FINAL");
    expect(stateFor(3)).toBe("SCHEDULED");
    expect(stateFor(4)).toBe("SCHEDULED");
  });

  it("dates future games in the future and past games in the past", () => {
    const data = source.seasonData({ playedThroughWeek: 2, now, season: SEASON });
    for (const g of data.games) {
      const future = g.startsAt.getTime() > now.getTime();
      expect(future).toBe(g.state === "SCHEDULED");
    }
  });

  it("supplies stat lines only for played weeks", () => {
    const data = source.seasonData({ playedThroughWeek: 2, now, season: SEASON });
    const played = data.games.filter((g) => g.state === "FINAL");
    const upcoming = data.games.filter((g) => g.state === "SCHEDULED");
    for (const g of played) expect(data.stats[g.eventId]?.length).toBeGreaterThan(0);
    for (const g of upcoming) expect(data.stats[g.eventId] ?? []).toEqual([]);
  });

  it("prefixes every event id with its source's prefix", () => {
    const data = source.seasonData({ playedThroughWeek: 4, now, season: SEASON });
    for (const g of data.games) expect(g.eventId.startsWith("mock-")).toBe(true);
  });

  it("is deterministic — same inputs produce identical data", () => {
    const a = source.seasonData({ playedThroughWeek: 2, now, season: SEASON });
    const b = source.seasonData({ playedThroughWeek: 2, now, season: SEASON });
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
  });

  it("groups rosters by nfl team for the pool sync", () => {
    const data = source.seasonData({ playedThroughWeek: 1, now, season: SEASON });
    expect(Object.keys(data.rosters).sort()).toEqual(["BUF", "KC"]);
    expect(data.rosters.KC.map((p) => p.externalId).sort()).toEqual(["p1", "p3"]);
  });

  it("ranks every player exactly once, contiguously from 1", () => {
    const ranks = source.defaultRanks();
    expect(ranks).toHaveLength(players.length);
    expect(ranks.map((r) => r.defaultRank).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("handles a season with nothing played", () => {
    const data = source.seasonData({ playedThroughWeek: 0, now, season: SEASON });
    expect(data.games.every((g) => g.state === "SCHEDULED")).toBe(true);
    expect(Object.values(data.stats).every((s) => s.length === 0)).toBe(true);
  });
});
