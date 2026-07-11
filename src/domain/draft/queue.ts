import type { PrismaClient } from "@prisma/client";
import { PlayerUnavailableError } from "../errors";

// Phase 4: multi-entry leagues will need an explicit entryId param.
async function entryForUser(db: PrismaClient, leagueId: string, userId: string) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });
  const entry = membership?.entries[0];
  if (!entry) throw new Error("not a member of this league");
  return entry;
}

export interface SetQueueInput {
  leagueId: string;
  userId: string;
  /** Full replacement, best first. Empty array clears the queue. */
  playerIds: string[];
}

export async function setQueue(db: PrismaClient, input: SetQueueInput) {
  const entry = await entryForUser(db, input.leagueId, input.userId);
  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });

  const unique = new Set(input.playerIds);
  if (unique.size !== input.playerIds.length) throw new PlayerUnavailableError();
  const players = await db.player.findMany({
    where: { id: { in: input.playerIds }, season: league.season },
  });
  if (players.length !== input.playerIds.length) throw new PlayerUnavailableError();

  return db.$transaction(async (tx) => {
    await tx.draftQueueItem.deleteMany({ where: { entryId: entry.id } });
    if (input.playerIds.length > 0) {
      await tx.draftQueueItem.createMany({
        data: input.playerIds.map((playerId, i) => ({
          entryId: entry.id,
          playerId,
          rank: i + 1,
        })),
      });
    }
  });
}

export async function getQueue(db: PrismaClient, input: { leagueId: string; userId: string }) {
  const entry = await entryForUser(db, input.leagueId, input.userId);
  return db.draftQueueItem.findMany({
    where: { entryId: entry.id },
    orderBy: { rank: "asc" },
    include: { player: true },
  });
}
