import type { PrismaClient } from "@prisma/client";
import { PickConflictError } from "../errors";
import { parseLeagueSettings } from "../league-settings";
import { applyPickAndAdvance } from "./advance";
import { assignSlot } from "./slot-assignment";
import { draftOrderSchema, entryIdForPick } from "./snake-order";

export interface AutodraftInput {
  leagueId: string;
  /** The pick the timer was armed for. If the draft has moved on, this is a stale timer: no-op. */
  expectedPickIndex: number;
}

/**
 * Makes the current pick on behalf of the on-clock entry: top valid queued player,
 * else best defaultRank player that fits. Returns null when there is nothing to do
 * (pick already made, draft complete/missing) — safe to call from stale timers.
 */
export async function autodraftCurrentPick(db: PrismaClient, input: AutodraftInput) {
  const draft = await db.draft.findUnique({
    where: { leagueId: input.leagueId },
    include: { picks: true },
  });
  if (!draft || draft.status !== "ACTIVE") return null;
  if (draft.currentPickIndex !== input.expectedPickIndex) return null;

  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  const settings = parseLeagueSettings(league.settings);
  const order = draftOrderSchema.parse(draft.order);
  const entryId = entryIdForPick(order, draft.currentPickIndex);

  const taken = new Set(draft.picks.map((p) => p.playerId));
  const filled = draft.picks.filter((p) => p.entryId === entryId).map((p) => p.slotIndex);

  let chosen: { playerId: string; slotIndex: number } | null = null;

  const queue = await db.draftQueueItem.findMany({
    where: { entryId },
    orderBy: { rank: "asc" },
    include: { player: true },
  });
  for (const item of queue) {
    if (taken.has(item.playerId)) continue;
    const slotIndex = assignSlot(settings.rosterSlots, filled, item.player.position);
    if (slotIndex !== null) {
      chosen = { playerId: item.playerId, slotIndex };
      break;
    }
  }

  if (!chosen) {
    const candidates = await db.player.findMany({
      where: { season: league.season, id: { notIn: [...taken] } },
      orderBy: { defaultRank: "asc" },
    });
    for (const p of candidates) {
      const slotIndex = assignSlot(settings.rosterSlots, filled, p.position);
      if (slotIndex !== null) {
        chosen = { playerId: p.id, slotIndex };
        break;
      }
    }
  }

  if (!chosen) {
    // Pool exhausted for this roster shape — misconfigured league; surface loudly.
    throw new Error(`autodraft: no draftable player for entry ${entryId} in league ${league.id}`);
  }

  try {
    return await applyPickAndAdvance(db, {
      draft, settings, order, entryId,
      playerId: chosen.playerId,
      slotIndex: chosen.slotIndex,
      autodrafted: true,
    });
  } catch (err) {
    if (err instanceof PickConflictError) return null; // human pick landed first — fine
    throw err;
  }
}
