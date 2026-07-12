import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createStandardPool,
} from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { joinLeague } from "../leagues/join-league";
import { scheduleDraft } from "./schedule-draft";
import { startDraft } from "./start-draft";
import {
  NotCommissionerError, ScheduleInPastError, DraftAlreadyStartedError, ScheduleTooFarOutError,
} from "../errors";

const future = () => new Date(Date.now() + 60 * 60 * 1000);

describe("scheduleDraft", () => {
  beforeEach(resetDb);

  it("commissioner sets and clears the scheduled time", async () => {
    const commish = await createTestUser();
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    const when = future();
    const updated = await scheduleDraft(testDb, {
      leagueId: league.id, userId: commish.id, scheduledAt: when,
    });
    expect(updated.draftScheduledAt?.getTime()).toBe(when.getTime());

    const cleared = await scheduleDraft(testDb, {
      leagueId: league.id, userId: commish.id, scheduledAt: null,
    });
    expect(cleared.draftScheduledAt).toBeNull();
  });

  it("rejects a scheduled time more than one year in the future", async () => {
    const commish = await createTestUser();
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    const twoYearsOut = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    await expect(
      scheduleDraft(testDb, { leagueId: league.id, userId: commish.id, scheduledAt: twoYearsOut }),
    ).rejects.toThrow(ScheduleTooFarOutError);
  });

  it("rejects non-commissioners, past times, and already-started drafts", async () => {
    const commish = await createTestUser();
    const member = await createTestUser();
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await expect(
      scheduleDraft(testDb, { leagueId: league.id, userId: member.id, scheduledAt: future() }),
    ).rejects.toThrow(NotCommissionerError);
    await expect(
      scheduleDraft(testDb, {
        leagueId: league.id, userId: commish.id, scheduledAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow(ScheduleInPastError);

    await joinLeague(testDb, {
      userId: member.id, inviteCode: league.inviteCode, teamName: "T2",
    });
    await createStandardPool(2);
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    await expect(
      scheduleDraft(testDb, { leagueId: league.id, userId: commish.id, scheduledAt: future() }),
    ).rejects.toThrow(DraftAlreadyStartedError);
  });
});
