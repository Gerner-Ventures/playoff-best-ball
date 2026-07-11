import { z } from "zod";

/** Draft.order JSON: entryIds in round-1 pick order. */
export const draftOrderSchema = z.array(z.string()).min(2);
export type DraftOrder = z.infer<typeof draftOrderSchema>;

/** 0-based position in `order` that owns overall pick `pickIndex` (snake: odd rounds reverse). */
export function entryIndexForPick(entryCount: number, pickIndex: number): number {
  const round = Math.floor(pickIndex / entryCount);
  const pos = pickIndex % entryCount;
  return round % 2 === 0 ? pos : entryCount - 1 - pos;
}

export function entryIdForPick(order: readonly string[], pickIndex: number): string {
  return order[entryIndexForPick(order.length, pickIndex)];
}

export function totalPicks(entryCount: number, slotCount: number): number {
  return entryCount * slotCount;
}

/** Fisher–Yates; returns a new array. */
export function shuffleOrder(entryIds: readonly string[]): string[] {
  const out = [...entryIds];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
