import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { firstName, formatDraftTime, getInvitePreview } from "./invite-preview";

describe("getInvitePreview", () => {
  beforeEach(resetDb);

  it("shows what joining would show, and only the commissioner's first name", async () => {
    const commish = await createTestUser("Dana Q. Smith");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "Dana's Playoff League", teamName: "DT",
      scoringPreset: "standard", pickClockHours: 8,
    });

    const preview = await getInvitePreview(testDb, league.inviteCode.toLowerCase());
    expect(preview).toEqual({
      leagueName: "Dana's Playoff League",
      season: league.season,
      commissionerFirstName: "Dana",
      draftScheduledAt: null,
      draftStarted: false,
      entryCount: 1,
      maxEntries: 10,
    });
  });

  it("returns null for an unknown code", async () => {
    expect(await getInvitePreview(testDb, "NOPE1234")).toBeNull();
  });

  it("reports entryCount equal to maxEntries when the league is full", async () => {
    const commish = await createTestUser("Full House");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "Full League", teamName: "FT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    const fresh = await testDb.league.findUniqueOrThrow({ where: { id: league.id } });
    const settings = fresh.settings as Record<string, unknown>;
    await testDb.league.update({
      where: { id: league.id },
      data: { settings: { ...settings, maxEntries: 1 } },
    });

    const preview = await getInvitePreview(testDb, league.inviteCode);
    expect(preview).toMatchObject({ entryCount: 1, maxEntries: 1 });
  });
});

describe("helpers", () => {
  it("firstName takes the first word and never returns an empty string", () => {
    expect(firstName("Cher")).toBe("Cher");
    expect(firstName("  Dana Q. Smith ")).toBe("Dana");
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });

  it("formatDraftTime is Eastern and says so", () => {
    expect(formatDraftTime(new Date("2027-01-11T01:00:00Z"))).toBe("Sun, Jan 10, 8:00 PM EST");
  });
});
