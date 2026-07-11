import type { PrismaClient } from "@prisma/client";
import { InvalidInviteError, LeagueFullError } from "../errors";
import { leagueSettingsSchema } from "../league-settings";

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

  const existing = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: input.userId } },
    include: { entries: true },
  });
  if (existing?.entries[0]) return existing.entries[0];

  const settings = leagueSettingsSchema.parse(league.settings);
  const entryCount = await db.entry.count({ where: { leagueId: league.id } });
  if (entryCount >= settings.maxEntries) throw new LeagueFullError(settings.maxEntries);

  const membership =
    existing ??
    (await db.membership.create({
      data: { leagueId: league.id, userId: input.userId, role: "MEMBER" },
    }));

  return db.entry.create({
    data: { leagueId: league.id, membershipId: membership.id, name: input.teamName },
  });
}
