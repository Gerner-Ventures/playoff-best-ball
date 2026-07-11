import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createTestPlayer } from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { setQueue, getQueue } from "./queue";
import { NotLeagueMemberError, PlayerUnavailableError } from "../errors";

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

  it("rejects duplicate playerIds", async () => {
    const { user, league } = await setup();
    const a = await createTestPlayer("RB");
    await expect(
      setQueue(testDb, { leagueId: league.id, userId: user.id, playerIds: [a.id, a.id] }),
    ).rejects.toThrow(PlayerUnavailableError);
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
    ).rejects.toThrow(NotLeagueMemberError);
  });
});
