import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { joinLeague } from "./join-league";
import { InvalidInviteError, LeagueFullError } from "../errors";

async function setupLeague() {
  const commish = await createTestUser("Commish");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "Commish Team",
    scoringPreset: "standard", pickClockHours: 8,
  });
  return { commish, league };
}

describe("joinLeague", () => {
  beforeEach(resetDb);

  it("creates membership + entry from a valid invite code", async () => {
    const { league } = await setupLeague();
    const joiner = await createTestUser("Friend");
    const entry = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "Friend Team",
    });
    expect(entry.leagueId).toBe(league.id);
    expect(entry.name).toBe("Friend Team");
    const membership = await testDb.membership.findUniqueOrThrow({
      where: { leagueId_userId: { leagueId: league.id, userId: joiner.id } },
    });
    expect(membership.role).toBe("MEMBER");
  });

  it("is idempotent — rejoining returns the existing entry", async () => {
    const { league } = await setupLeague();
    const joiner = await createTestUser();
    const first = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "T",
    });
    const second = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "Different",
    });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe(first.name); // first-write-wins: teamName is pinned on join
    expect(await testDb.entry.count({ where: { leagueId: league.id } })).toBe(2); // commish + joiner
  });

  it("accepts lowercase invite codes", async () => {
    const { league } = await setupLeague();
    const joiner = await createTestUser();
    const entry = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode.toLowerCase(), teamName: "T",
    });
    expect(entry.leagueId).toBe(league.id);
  });

  it("rejects an unknown invite code", async () => {
    const joiner = await createTestUser();
    await expect(
      joinLeague(testDb, { userId: joiner.id, inviteCode: "NOPENOPE", teamName: "T" }),
    ).rejects.toThrow(InvalidInviteError);
  });

  it("rejects the 11th entry on a FREE league", async () => {
    const { league } = await setupLeague(); // entry 1 = commissioner
    for (let i = 0; i < 9; i++) {
      const u = await createTestUser(`U${i}`);
      await joinLeague(testDb, { userId: u.id, inviteCode: league.inviteCode, teamName: `T${i}` });
    }
    const eleventh = await createTestUser("Eleventh");
    await expect(
      joinLeague(testDb, { userId: eleventh.id, inviteCode: league.inviteCode, teamName: "T" }),
    ).rejects.toThrow(LeagueFullError);
  });

  it("self-heals an orphaned membership (membership exists but no entry)", async () => {
    const { league } = await setupLeague();
    const user = await createTestUser("Orphan");
    // Simulate an incomplete prior join: membership present, no entry
    const membership = await testDb.membership.create({
      data: { leagueId: league.id, userId: user.id, role: "MEMBER" },
    });
    const entry = await joinLeague(testDb, {
      userId: user.id, inviteCode: league.inviteCode, teamName: "Recovery Team",
    });
    expect(entry.leagueId).toBe(league.id);
    expect(entry.name).toBe("Recovery Team");
    // Exactly one membership for this user in the league
    expect(
      await testDb.membership.count({ where: { leagueId: league.id, userId: user.id } }),
    ).toBe(1);
    // Membership ID is the pre-existing one
    expect(entry.membershipId).toBe(membership.id);
  });

  it("existing member rejoining a full league gets their entry back (not LeagueFullError)", async () => {
    const { league } = await setupLeague(); // entry 1 = commissioner
    const joiner = await createTestUser("EarlyBird");
    await joinLeague(testDb, { userId: joiner.id, inviteCode: league.inviteCode, teamName: "EarlyBird Team" });
    // Fill remaining 8 slots
    for (let i = 0; i < 8; i++) {
      const u = await createTestUser(`Filler${i}`);
      await joinLeague(testDb, { userId: u.id, inviteCode: league.inviteCode, teamName: `Filler${i}` });
    }
    // League is now full (10/10). EarlyBird rejoining must return their existing entry.
    const second = await joinLeague(testDb, {
      userId: joiner.id, inviteCode: league.inviteCode, teamName: "Different Name",
    });
    expect(second.leagueId).toBe(league.id);
    expect(second.name).toBe("EarlyBird Team"); // first-write-wins
  });
});
