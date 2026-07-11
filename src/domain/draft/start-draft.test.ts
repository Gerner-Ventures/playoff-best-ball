import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "../leagues/create-league";
import { joinLeague } from "../leagues/join-league";
import { startDraft } from "./start-draft";
import {
  DraftAlreadyStartedError,
  NotCommissionerError,
  TooFewEntriesError,
} from "../errors";
import { draftOrderSchema } from "./snake-order";

async function leagueWithMembers(memberCount: number) {
  const commish = await createTestUser("Commish");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "Commish Team",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const members = [];
  for (let i = 0; i < memberCount; i++) {
    const u = await createTestUser(`M${i}`);
    await joinLeague(testDb, { userId: u.id, inviteCode: league.inviteCode, teamName: `T${i}` });
    members.push(u);
  }
  return { commish, league, members };
}

describe("startDraft", () => {
  beforeEach(resetDb);

  it("creates an ACTIVE draft with a shuffled order and a first deadline", async () => {
    const { commish, league } = await leagueWithMembers(2);
    const before = Date.now();
    const draft = await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    expect(draft.status).toBe("ACTIVE");
    expect(draft.currentPickIndex).toBe(0);
    const order = draftOrderSchema.parse(draft.order);
    const entries = await testDb.entry.findMany({ where: { leagueId: league.id } });
    expect([...order].sort()).toEqual(entries.map((e) => e.id).sort());
    expect(draft.currentDeadline!.getTime()).toBeGreaterThan(before);
  });

  it("accepts an explicit order that is a permutation of the entries", async () => {
    const { commish, league } = await leagueWithMembers(1);
    const entries = await testDb.entry.findMany({ where: { leagueId: league.id } });
    const order = entries.map((e) => e.id).reverse();
    const draft = await startDraft(testDb, { leagueId: league.id, userId: commish.id, order });
    expect(draft.order).toEqual(order);
  });

  it("rejects an order that isn't a permutation", async () => {
    const { commish, league } = await leagueWithMembers(1);
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: commish.id, order: ["bogus", "ids"] }),
    ).rejects.toThrow(/order must contain each entry exactly once/i);
  });

  it("only the commissioner can start", async () => {
    const { league, members } = await leagueWithMembers(1);
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: members[0].id }),
    ).rejects.toThrow(NotCommissionerError);
  });

  it("needs at least 2 entries", async () => {
    const { commish, league } = await leagueWithMembers(0);
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: commish.id }),
    ).rejects.toThrow(TooFewEntriesError);
  });

  it("cannot start twice", async () => {
    const { commish, league } = await leagueWithMembers(1);
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    await expect(
      startDraft(testDb, { leagueId: league.id, userId: commish.id }),
    ).rejects.toThrow(DraftAlreadyStartedError);
  });
});
