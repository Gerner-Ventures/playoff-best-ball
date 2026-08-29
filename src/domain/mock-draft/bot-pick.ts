import type { PlayerPosition } from "@prisma/client";
import type { RosterSlotDef } from "../league-settings";
import { assignSlot } from "../draft/slot-assignment";

export interface BotCandidate {
  id: string;
  position: PlayerPosition;
}

/** How many of the best remaining players a bot will consider. */
export const BOT_WINDOW = 5;

/**
 * Best-available-with-jitter. Strict best-available would make every mock play
 * out identically, which defeats the point of practising; jitter keeps the board
 * from being memorised without pretending to model how real managers think.
 *
 * `candidates` must already be ordered by defaultRank (best first). `rng` is
 * injected so the choice is deterministic under test.
 */
export function botPick(
  candidates: readonly BotCandidate[],
  filledSlotIndexes: readonly number[],
  rosterSlots: readonly RosterSlotDef[],
  rng: () => number = Math.random,
): { playerId: string; slotIndex: number } | null {
  const window: { playerId: string; slotIndex: number }[] = [];
  for (const c of candidates) {
    const slotIndex = assignSlot(rosterSlots, filledSlotIndexes, c.position);
    if (slotIndex === null) continue; // no open slot for this position — skip
    window.push({ playerId: c.id, slotIndex });
    if (window.length === BOT_WINDOW) break;
  }
  if (window.length === 0) return null;

  // Weight position i as (windowSize - i): a full window is 5/4/3/2/1, a
  // two-candidate window is 2/1. Best player usually goes, but not always.
  const size = window.length;
  const totalWeight = (size * (size + 1)) / 2;
  let target = rng() * totalWeight;
  for (let i = 0; i < size; i++) {
    target -= size - i;
    if (target < 0) return window[i];
  }
  return window[size - 1]; // rng returned ~1; take the last
}
