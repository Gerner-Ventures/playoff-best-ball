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
