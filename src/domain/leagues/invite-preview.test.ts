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
