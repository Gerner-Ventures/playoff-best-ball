import type { MockDraft, PrismaClient } from "@prisma/client";
import { entryIdForPick, totalPicks, draftOrderSchema } from "../draft/snake-order";
import { mockDraftConfigSchema, mockPicksSchema, type MockPick } from "./config";
import { botPick, type BotCandidate } from "./bot-pick";

/** The row's JSON columns, parsed and validated once. */
export function readMock(mock: MockDraft) {
  return {
    config: mockDraftConfigSchema.parse(mock.config),
    order: draftOrderSchema.parse(mock.order),
    picks: mockPicksSchema.parse(mock.picks),
  };
}

export function seatForPick(order: readonly string[], pickIndex: number): string {
  return entryIdForPick(order, pickIndex);
}

export interface AdvanceResult {
  picks: MockPick[];
  currentPickIndex: number;
  complete: boolean;
}

/**
 * Runs bot seats until the human is on the clock or the board is full. Pure over
 * the pool — no DB access — so it is trivially testable and callable from both
 * start and pick without duplicating the loop.
 *
 * `pool` must be ordered by defaultRank (best first).
 */
export function advanceThroughBots(
  input: {
    order: readonly string[];
    humanSeat: string;
    rosterSlots: readonly { slot: string }[];
    picks: readonly MockPick[];
    currentPickIndex: number;
  },
  pool: readonly BotCandidate[],
  rng: () => number = Math.random,
): AdvanceResult {
  const slots = input.rosterSlots as Parameters<typeof botPick>[2];
  const total = totalPicks(input.order.length, input.rosterSlots.length);
  const picks = [...input.picks];
  let index = input.currentPickIndex;

  while (index < total) {
    const seat = seatForPick(input.order, index);
    if (seat === input.humanSeat) return { picks, currentPickIndex: index, complete: false };

    const taken = new Set(picks.map((p) => p.playerId));
    const filled = picks.filter((p) => p.seat === seat).map((p) => p.slotIndex);
    const chosen = botPick(
      pool.filter((p) => !taken.has(p.id)),
      filled,
      slots,
      rng,
    );
    // Pool exhausted for this roster shape. The real autodraft throws here
    // because that means a misconfigured league; in a mock the user picked the
    // roster themselves, so the draft simply ends.
    if (!chosen) return { picks, currentPickIndex: index, complete: true };

    picks.push({ pickIndex: index, seat, playerId: chosen.playerId, slotIndex: chosen.slotIndex });
    index += 1;
  }
  return { picks, currentPickIndex: index, complete: true };
}

/** Season pool ordered the way bots read it. */
export async function loadPool(db: PrismaClient, season: number): Promise<BotCandidate[]> {
  const players = await db.player.findMany({
    where: { season },
    orderBy: { defaultRank: "asc" },
    select: { id: true, position: true },
  });
  return players;
}
