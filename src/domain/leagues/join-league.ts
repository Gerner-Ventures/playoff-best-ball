import { Prisma, type PrismaClient } from "@prisma/client";
import { InvalidInviteError, LeagueFullError } from "../errors";
import { parseLeagueSettings } from "../league-settings";

export interface JoinLeagueInput {
  userId: string;
  inviteCode: string;
  teamName: string;
}

export async function joinLeague(db: PrismaClient, input: JoinLeagueInput) {
  const league = await db.league.findUnique({
    where: { inviteCode: input.inviteCode.toUpperCase() },
  });
  if (!league) throw new InvalidInviteError();

  // NOTE: idempotency depends on this include. Defensive: if a membership ever exists without an entry (manual DB edit, future bug), it falls through and self-heals below.
  const existing = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: input.userId } },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });
  // teamName is ignored on rejoin — first write wins.
  if (existing?.entries[0]) return existing.entries[0];

  const settings = parseLeagueSettings(league.settings);
  const entryCount = await db.entry.count({ where: { leagueId: league.id } });
  if (entryCount >= settings.maxEntries) throw new LeagueFullError(settings.maxEntries);

  // Transaction: no orphaned membership if we crash mid-join, and the re-count below narrows the join-rush race window (hard guarantee would need a DB constraint).
  try {
    return await db.$transaction(async (tx) => {
      const txEntryCount = await tx.entry.count({ where: { leagueId: league.id } });
      if (txEntryCount >= settings.maxEntries) throw new LeagueFullError(settings.maxEntries);

      const membership =
        existing ??
        (await tx.membership.create({
          data: { leagueId: league.id, userId: input.userId, role: "MEMBER" },
        }));

      return tx.entry.create({
        data: { leagueId: league.id, membershipId: membership.id, name: input.teamName },
      });
    });
  } catch (err) {
    // Two concurrent requests for the same user can both pass the pre-transaction idempotency
    // check and then race to insert the membership; the loser gets a P2002 unique violation.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const recovered = await db.membership.findUnique({
        where: { leagueId_userId: { leagueId: league.id, userId: input.userId } },
        include: { entries: { orderBy: { createdAt: "asc" } } },
      });
      if (recovered?.entries[0]) return recovered.entries[0];
    }
    throw err;
  }
}
