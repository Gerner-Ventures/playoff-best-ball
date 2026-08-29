import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createStandardPool } from "../../../tests/helpers/db";
import { DEFAULT_ROSTER_SLOTS } from "../league-settings";
import { entryIdForPick, totalPicks } from "../draft/snake-order";
import { startMockDraft, discardMockDraft } from "./start";
import { makeMockPick } from "./pick";
import { getMockDraftState } from "./state";
import { readMock, seatForPick } from "./engine";
import { CURRENT_SEASON } from "../season";

const CONFIG = { teamCount: 4, rosterSlots: DEFAULT_ROSTER_SLOTS };
const seeded = () => {
  let n = 0;
  return () => ((n = (n * 9301 + 49297) % 233280), n / 233280);
};

async function startFor(userId: string, config = CONFIG) {
  return startMockDraft(testDb, { userId, season: CURRENT_SEASON, config, rng: seeded() });
}

describe("mock draft", () => {
  beforeEach(async () => {
    await resetDb();
    await createStandardPool(12); // comfortably more than teamCount × slots
  });

  it("starts with the human on the clock and bots already picked ahead of them", async () => {
    const user = await createTestUser();
    const mock = await startFor(user.id);
    const { order, picks } = readMock(mock);

    expect(order).toHaveLength(CONFIG.teamCount);
    expect(mock.status).toBe("ACTIVE");
    // every pick made so far belongs to a bot, and it is now the human's turn
    expect(picks.every((p) => p.seat !== mock.humanSeat)).toBe(true);
    expect(seatForPick(order, mock.currentPickIndex)).toBe(mock.humanSeat);
  });

  it("is one per user — starting again replaces the first", async () => {
    const user = await createTestUser();
    const first = await startFor(user.id);
    const second = await startFor(user.id);
    expect(second.id).toBe(first.id);
    expect(await testDb.mockDraft.count({ where: { userId: user.id } })).toBe(1);
  });

  it("applies the human pick and runs bots back round to them", async () => {
    const user = await createTestUser();
    const mock = await startFor(user.id);
    const before = await getMockDraftState(testDb, user.id);
    const target = before!.available[0];

    const after = await makeMockPick(testDb, { userId: user.id, playerId: target.id, rng: seeded() });
    const { picks } = readMock(after);

    expect(picks.some((p) => p.seat === after.humanSeat && p.playerId === target.id)).toBe(true);
    expect(after.currentPickIndex).toBeGreaterThan(mock.currentPickIndex);
    if (after.status === "ACTIVE") {
      expect(seatForPick(readMock(after).order, after.currentPickIndex)).toBe(after.humanSeat);
    }
  });

  it("rejects a player someone already took", async () => {
    const user = await createTestUser();
    await startFor(user.id);
    // Don't assume a bot has picked — the human can draw the first pick. Take a
    // player ourselves, then try to take the same one again.
    const state = await getMockDraftState(testDb, user.id);
    const mine = state!.available[0];
    await makeMockPick(testDb, { userId: user.id, playerId: mine.id, rng: seeded() });
    await expect(makeMockPick(testDb, { userId: user.id, playerId: mine.id })).rejects.toThrow(
      /isn't available/i,
    );
  });

  it("rejects a player whose position has no open slot", async () => {
    const user = await createTestUser();
    await startFor(user.id);
    // DEFAULT_ROSTER_SLOTS has one QB slot: take a QB, then try another.
    const qbs = await testDb.player.findMany({ where: { position: "QB" }, orderBy: { defaultRank: "asc" } });
    const mock = await makeMockPick(testDb, { userId: user.id, playerId: qbs[0].id, rng: seeded() });
    const stillOpen = readMock(mock).picks.map((p) => p.playerId);
    const nextQb = qbs.find((q) => !stillOpen.includes(q.id))!;
    await expect(
      makeMockPick(testDb, { userId: user.id, playerId: nextQb.id, rng: seeded() }),
    ).rejects.toThrow(/no open roster slot/i);
  });

  it("runs to completion with every seat holding a full roster and no duplicates", async () => {
    const user = await createTestUser();
    let mock = await startFor(user.id);
    const slots = CONFIG.rosterSlots.length;

    let guard = 0;
    while (mock.status === "ACTIVE") {
      if (guard++ > 200) throw new Error("mock draft failed to terminate");
      const state = await getMockDraftState(testDb, user.id);
      // first available player that fits an open slot for us
      const openSlots = state!.myRoster.filter((r) => !r.player).map((r) => r.slot);
      const next = state!.available.find(
        (p) => openSlots.includes(p.position) || (openSlots.includes("FLEX") && ["RB", "WR", "TE"].includes(p.position)),
      )!;
      mock = await makeMockPick(testDb, { userId: user.id, playerId: next.id, rng: seeded() });
    }

    const { order, picks } = readMock(mock);
    expect(mock.status).toBe("COMPLETE");
    expect(picks).toHaveLength(totalPicks(order.length, slots));
    expect(new Set(picks.map((p) => p.playerId)).size).toBe(picks.length); // no player twice
    for (const seat of order) {
      expect(picks.filter((p) => p.seat === seat)).toHaveLength(slots);
    }
  });

  it("drift guard: mock pick order matches the real engine's snake order", async () => {
    const user = await createTestUser();
    const mock = await startFor(user.id);
    const { order, picks } = readMock(mock);
    for (const p of picks) {
      expect(p.seat).toBe(entryIdForPick(order, p.pickIndex));
    }
  });

  it("discards on request", async () => {
    const user = await createTestUser();
    await startFor(user.id);
    await discardMockDraft(testDb, user.id);
    expect(await getMockDraftState(testDb, user.id)).toBeNull();
  });
});
