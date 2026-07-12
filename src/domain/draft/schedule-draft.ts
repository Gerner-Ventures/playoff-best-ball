import type { PrismaClient } from "@prisma/client";
import {
  DraftAlreadyStartedError,
  NotCommissionerError,
  ScheduleInPastError,
} from "../errors";

export interface ScheduleDraftInput {
  leagueId: string;
  userId: string;
  /** null clears the schedule. */
  scheduledAt: Date | null;
}

export async function scheduleDraft(db: PrismaClient, input: ScheduleDraftInput) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();

  const league = await db.league.findUniqueOrThrow({
    where: { id: input.leagueId },
    include: { draft: { select: { id: true } } },
  });
  if (league.draft) throw new DraftAlreadyStartedError();
  if (input.scheduledAt && input.scheduledAt.getTime() <= Date.now()) {
    throw new ScheduleInPastError();
  }

  return db.league.update({
    where: { id: input.leagueId },
    data: { draftScheduledAt: input.scheduledAt },
  });
}
