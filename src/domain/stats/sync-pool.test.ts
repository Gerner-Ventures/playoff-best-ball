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
    expect(again.updated).toBe(3);
    expect(await testDb.player.count()).toBe(3);
  });
});
