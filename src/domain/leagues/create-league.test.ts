import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { FreeLeagueLimitError } from "../errors";
import { CURRENT_SEASON } from "../season";
import { buildDefaultSettings } from "../league-settings";
import { generateInviteCode } from "../invite-code";
import type { Prisma } from "@prisma/client";

describe("createLeague", () => {
  beforeEach(resetDb);

  it("creates league + commissioner membership + entry in one shot", async () => {
    const user = await createTestUser("Nick");
    const league = await createLeague(testDb, {
      userId: user.id,
      name: "The Gerner Invitational",
      teamName: "Team Nick",
      scoringPreset: "half_ppr",
      pickClockHours: 8,
    });

    expect(league.season).toBe(CURRENT_SEASON);
    expect(league.tier).toBe("FREE");
    expect(league.inviteCode).toHaveLength(8);

    const membership = await testDb.membership.findUniqueOrThrow({
      where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
      include: { entries: true },
    });
    expect(membership.role).toBe("COMMISSIONER");
    expect(membership.entries).toHaveLength(1);
    expect(membership.entries[0].name).toBe("Team Nick");
  });

  it("stores validated settings JSON from the preset", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id,
      name: "L",
      teamName: "T",
      scoringPreset: "full_ppr",
      pickClockHours: 24,
    });
    const settings = league.settings as { scoring: { ppr: number }; pickClockHours: number };
    expect(settings.scoring.ppr).toBe(1);
    expect(settings.pickClockHours).toBe(24);
  });

  it("rejects a second FREE league for the same commissioner in a season", async () => {
    const user = await createTestUser();
    const input = {
      userId: user.id,
      name: "First",
      teamName: "T",
      scoringPreset: "standard" as const,
      pickClockHours: 8 as const,
    };
    await createLeague(testDb, input);
    await expect(createLeague(testDb, { ...input, name: "Second" })).rejects.toThrow(
      FreeLeagueLimitError,
    );
  });

  it("free-league gate is scoped to the current season (a prior-season FREE league is not counted)", async () => {
    const user = await createTestUser("PriorSeason");
    const settings = buildDefaultSettings("standard", 8);
    // Directly insert a league from a prior season with a COMMISSIONER membership
    const oldLeague = await testDb.league.create({
      data: {
        name: "Old League",
        season: 2025,
        inviteCode: generateInviteCode(),
        settings: settings as Prisma.InputJsonValue,
      },
    });
    await testDb.membership.create({
      data: { leagueId: oldLeague.id, userId: user.id, role: "COMMISSIONER" },
    });
    // Creating a league in CURRENT_SEASON must still succeed
    await expect(
      createLeague(testDb, {
        userId: user.id,
        name: "Current Season League",
        teamName: "T",
        scoringPreset: "standard",
        pickClockHours: 8,
      }),
    ).resolves.toMatchObject({ season: CURRENT_SEASON });
  });

  it("allows commissioning a league even when a member of others", async () => {
    const commish = await createTestUser("A");
    const member = await createTestUser("B");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L1", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await testDb.membership.create({
      data: { leagueId: league.id, userId: member.id, role: "MEMBER" },
    });
    // member commissions their own league — fine
    await expect(
      createLeague(testDb, {
        userId: member.id, name: "L2", teamName: "T2",
        scoringPreset: "standard", pickClockHours: 8,
      }),
    ).resolves.toBeTruthy();
  });
});
