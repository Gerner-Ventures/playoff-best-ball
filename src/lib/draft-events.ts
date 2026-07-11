import type { PrismaClient } from "@prisma/client";
import { draftOrderSchema, entryIdForPick } from "@/domain/draft/snake-order";
import { inngest } from "./inngest";

/**
 * Announces the draft's current state to Inngest: arms the pick clock for the
 * on-clock turn, or emits completion. Failures are caught and logged — the pick
 * itself must never fail because eventing is down (dev without `inngest-cli dev`,
 * transient outage). A missed turn event means no autodraft timer for that turn,
 * which self-corrects on the next human pick.
 */
export async function announceDraftState(db: PrismaClient, leagueId: string): Promise<void> {
  try {
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
  } catch (err) {
    console.error(`[draft-events] failed to announce draft state for league ${leagueId}:`, err);
  }
}
