import type { PrismaClient, Prisma } from "@prisma/client";
import { generateInviteCode } from "../invite-code";
import { FreeLeagueLimitError } from "../errors";
import { CURRENT_SEASON } from "../season";
import {
  buildDefaultSettings,
  type PickClockHours,
  type ScoringPresetName,
} from "../league-settings";

export interface CreateLeagueInput {
  userId: string;
  name: string;
  teamName: string;
  scoringPreset: ScoringPresetName;
  pickClockHours: PickClockHours;
}

export async function createLeague(db: PrismaClient, input: CreateLeagueInput) {
  // TOCTOU: two concurrent calls could both pass this check. Accepted — soft
  // monetization gate, low traffic; revisit if it's ever abused.
  const existingFree = await db.league.count({
    where: {
      season: CURRENT_SEASON,
      tier: "FREE",
      memberships: { some: { userId: input.userId, role: "COMMISSIONER" } },
    },
  });
  if (existingFree >= 1) throw new FreeLeagueLimitError();

  const settings = buildDefaultSettings(input.scoringPreset, input.pickClockHours);

  // League + commissioner membership + entry must appear together or not at all.
  return db.$transaction(async (tx) => {
    const league = await tx.league.create({
      data: {
        name: input.name,
        season: CURRENT_SEASON,
        inviteCode: generateInviteCode(),
        settings: settings as Prisma.InputJsonValue,
      },
    });
    const membership = await tx.membership.create({
      data: { leagueId: league.id, userId: input.userId, role: "COMMISSIONER" },
    });
    await tx.entry.create({
      data: { leagueId: league.id, membershipId: membership.id, name: input.teamName },
    });
    return league;
  });
}
