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
  const entries = await testDb.entry.findMany({
    where: { leagueId: league.id },
    orderBy: { createdAt: "asc" },
  });
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
