import type { PrismaClient } from "@prisma/client";
import { draftOrderSchema, entryIdForPick } from "@/domain/draft/snake-order";
import { inngest } from "./inngest";

/**
 * Announces the draft's current state to Inngest: arms the pick clock for the
 * on-clock turn, or emits completion.
 *
 * Throws on send failure — call from Inngest steps (retries are free there).
 * Request paths must use safeAnnounceDraftState.
 */
export async function announceDraftState(db: PrismaClient, leagueId: string): Promise<void> {
  const draft = await db.draft.findUnique({ where: { leagueId } });
  if (!draft) return;
  if (draft.status === "COMPLETE") {
    await inngest.send({
      name: "draft/completed",
      data: { leagueId, draftId: draft.id },
    });
    return;
  }
  const order = draftOrderSchema.parse(draft.order);
  await inngest.send({
    name: "draft/turn.started",
    data: {
      leagueId,
      draftId: draft.id,
      pickIndex: draft.currentPickIndex,
      entryId: entryIdForPick(order, draft.currentPickIndex),
      deadline: draft.currentDeadline!.toISOString(),
    },
  });
}

/**
 * Fire-and-forget wrapper around announceDraftState for use in request paths.
 * // A pick must never fail because eventing is down; a missed timer self-corrects on the next human pick.
 */
export async function safeAnnounceDraftState(db: PrismaClient, leagueId: string): Promise<void> {
  try {
    await announceDraftState(db, leagueId);
  } catch (err) {
    console.error(`[draft-events] failed to announce draft state for league ${leagueId}:`, err);
  }
}
