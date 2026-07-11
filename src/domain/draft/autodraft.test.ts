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
  await createStandardPool(2);
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
