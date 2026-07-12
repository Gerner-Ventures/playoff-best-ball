import type { PlayerPosition } from "@prisma/client";
import type { RosterSlotDef } from "../league-settings";
import { FLEX_ELIGIBLE } from "../draft/slot-assignment";

export interface ScoredPlayer {
  playerId: string;
  position: PlayerPosition;
  points: number;
}

export interface LineupSlot {
  slotIndex: number;
  playerId: string | null;
  points: number;
}

/**
 * Best-ball optimal lineup: direct slots take the best remaining player of their
 * position, then FLEX slots take the best remaining FLEX-eligible player.
 * This greedy fill is exactly optimal when FLEX eligibility is a superset of the
 * direct slot positions (true for every v1 roster shape); revisit if slot types
 * with overlapping partial eligibility (e.g. superflex) arrive.
 */
export function optimalLineup(
  rosterSlots: readonly RosterSlotDef[],
  players: readonly ScoredPlayer[],
): { slots: LineupSlot[]; total: number } {
  const remaining = [...players].sort((a, b) => b.points - a.points);
  const slots: LineupSlot[] = rosterSlots.map((_, i) => ({ slotIndex: i, playerId: null, points: 0 }));

  const takeBest = (eligible: (p: ScoredPlayer) => boolean): ScoredPlayer | null => {
    const idx = remaining.findIndex(eligible);
    return idx === -1 ? null : remaining.splice(idx, 1)[0];
  };

  rosterSlots.forEach((slot, i) => {
    if (slot.slot === "FLEX") return;
    const best = takeBest((c) => c.position === slot.slot);
    if (best) slots[i] = { slotIndex: i, playerId: best.playerId, points: best.points };
  });
  rosterSlots.forEach((slot, i) => {
    if (slot.slot !== "FLEX") return;
    const best = takeBest((c) => FLEX_ELIGIBLE.includes(c.position));
    if (best) slots[i] = { slotIndex: i, playerId: best.playerId, points: best.points };
  });

  const total = slots.reduce((sum, s) => sum + s.points, 0);
  return { slots, total };
}
