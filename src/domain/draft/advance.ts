import { Prisma, type Draft, type PrismaClient } from "@prisma/client";
import type { LeagueSettings } from "../league-settings";
import { PickConflictError } from "../errors";
import { computePickDeadline } from "./pick-clock";
import { totalPicks, type DraftOrder } from "./snake-order";

export interface ApplyPickInput {
  draft: Draft;
  settings: LeagueSettings;
  order: DraftOrder;
  entryId: string;
  playerId: string;
  slotIndex: number;
  autodrafted: boolean;
}

/**
 * Records the current pick and advances the draft in one transaction.
 * Concurrency: the updateMany count guard + the (draftId, pickIndex) unique
 * constraint mean exactly one of two racing picks wins; the loser gets PickConflictError.
 */
export async function applyPickAndAdvance(db: PrismaClient, input: ApplyPickInput) {
  const { draft, settings, order } = input;
  const nextIndex = draft.currentPickIndex + 1;
  const complete = nextIndex >= totalPicks(order.length, settings.rosterSlots.length);
  const nextDeadline = complete
    ? null
    : computePickDeadline(new Date(), settings.pickClockHours, settings.overnightPause);

  try {
    return await db.$transaction(async (tx) => {
      const pick = await tx.draftPick.create({
        data: {
          draftId: draft.id,
          pickIndex: draft.currentPickIndex,
          entryId: input.entryId,
          playerId: input.playerId,
          slotIndex: input.slotIndex,
          autodrafted: input.autodrafted,
        },
      });
      const updated = await tx.draft.updateMany({
        where: { id: draft.id, currentPickIndex: draft.currentPickIndex, status: "ACTIVE" },
        data: {
          currentPickIndex: nextIndex,
          currentDeadline: nextDeadline,
          status: complete ? "COMPLETE" : "ACTIVE",
        },
      });
      if (updated.count !== 1) throw new PickConflictError();
      const fresh = await tx.draft.findUniqueOrThrow({ where: { id: draft.id } });
      return { pick, draft: fresh };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PickConflictError();
    }
    throw err;
  }
}
