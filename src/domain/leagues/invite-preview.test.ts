import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { draftTimeLabel, firstName, formatDraftTime, getInvitePreview } from "./invite-preview";

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

  it("reports draftStarted when a draft row exists", async () => {
    const commish = await createTestUser("Casey Draftly");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "Casey's League", teamName: "CT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    // Minimal Draft row: leagueId and order are the only fields without a default.
    await testDb.draft.create({ data: { leagueId: league.id, order: [] } });

    const preview = await getInvitePreview(testDb, league.inviteCode);
    expect(preview?.draftStarted).toBe(true);
  });
});

describe("helpers", () => {
  it("firstName takes the first word and never returns an empty string", () => {
    expect(firstName("Cher")).toBe("Cher");
    expect(firstName("  Dana Q. Smith ")).toBe("Dana");
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });

  it("firstName skips a leading honorific", () => {
    expect(firstName("Dr. Jane Smith")).toBe("Jane");
    expect(firstName("Mr. Smith")).toBe("Smith");
    expect(firstName("PROF. Jane")).toBe("Jane");
    expect(firstName("Dr.")).toBeNull();
  });

  it("formatDraftTime is Eastern and says so", () => {
    expect(formatDraftTime(new Date("2027-01-11T01:00:00Z"))).toBe("Sun, Jan 10, 8:00 PM EST");
  });

  it("draftTimeLabel is unscheduled when there's no date", () => {
    expect(draftTimeLabel({ draftScheduledAt: null, draftStarted: false }, new Date())).toEqual({
      kind: "unscheduled",
    });
  });

  it("draftTimeLabel is upcoming when the date is ahead of now", () => {
    const at = new Date("2027-01-11T01:00:00Z");
    const now = new Date("2027-01-01T00:00:00Z");
    expect(draftTimeLabel({ draftScheduledAt: at, draftStarted: false }, now)).toEqual({
      kind: "upcoming",
      at,
    });
  });

  it("draftTimeLabel is not_started once the date has passed and the draft never started", () => {
    const at = new Date("2027-01-01T00:00:00Z");
    const now = new Date("2027-01-11T01:00:00Z");
    expect(draftTimeLabel({ draftScheduledAt: at, draftStarted: false }, now)).toEqual({
      kind: "not_started",
    });
  });

  it("draftTimeLabel still shows the time once the draft has started, even if it's in the past", () => {
    const at = new Date("2027-01-01T00:00:00Z");
    const now = new Date("2027-01-11T01:00:00Z");
    expect(draftTimeLabel({ draftScheduledAt: at, draftStarted: true }, now)).toEqual({
      kind: "upcoming",
      at,
    });
  });
});
