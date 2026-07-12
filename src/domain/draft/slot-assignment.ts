import type { PlayerPosition } from "@prisma/client";
import type { RosterSlotDef } from "../league-settings";

export const FLEX_ELIGIBLE: PlayerPosition[] = ["RB", "WR", "TE"];

/**
 * Which roster slot (index into rosterSlots) a player of `position` fills for an
 * entry whose already-filled slot indexes are `filledSlotIndexes`.
 * Direct slot first, then FLEX for eligible positions. null = no legal slot.
 */
export function assignSlot(
  rosterSlots: readonly RosterSlotDef[],
  filledSlotIndexes: readonly number[],
  position: PlayerPosition,
): number | null {
  const filled = new Set(filledSlotIndexes);
  const direct = rosterSlots.findIndex((s, i) => !filled.has(i) && s.slot === position);
  if (direct !== -1) return direct;
  if (FLEX_ELIGIBLE.includes(position)) {
    const flex = rosterSlots.findIndex((s, i) => !filled.has(i) && s.slot === "FLEX");
    if (flex !== -1) return flex;
  }
  return null;
}
