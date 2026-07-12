import type { PrismaClient } from "@prisma/client";
import {
  InvalidSubstitutionError,
  NotCommissionerError,
  SubstitutionsDisabledError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";

export interface SetSubstitutionInput {
  leagueId: string;
  userId: string;
  entryId: string;
  originalPlayerId: string;
  substitutePlayerId: string;
  effectiveWeek: number; // 1..4; validated at the route
  reason?: string;
}

async function requireCommissionerWithSubsEnabled(
  db: PrismaClient,
  leagueId: string,
  userId: string,
) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();
  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });
  if (!parseLeagueSettings(league.settings).substitutionsEnabled) {
    throw new SubstitutionsDisabledError();
  }
  return league;
}

/** Commissioner swaps an injured player: original scores before effectiveWeek, substitute from it on. */
export async function setSubstitution(db: PrismaClient, input: SetSubstitutionInput) {
  const league = await requireCommissionerWithSubsEnabled(db, input.leagueId, input.userId);

  const entry = await db.entry.findUnique({ where: { id: input.entryId } });
  if (!entry || entry.leagueId !== input.leagueId) {
    throw new InvalidSubstitutionError("that team isn't in this league");
  }
  const originalPick = await db.draftPick.findFirst({
    where: { entryId: input.entryId, playerId: input.originalPlayerId },
    include: { player: true },
  });
  if (!originalPick) throw new InvalidSubstitutionError("the original player isn't on that roster");

  const substitute = await db.player.findUnique({ where: { id: input.substitutePlayerId } });
  if (!substitute || substitute.season !== league.season) {
    throw new InvalidSubstitutionError("unknown substitute");
  }
  if (substitute.position !== originalPick.player.position) {
    throw new InvalidSubstitutionError("the substitute must play the same position");
  }
  // Scoped to THIS league's draft: two entries in different leagues substituting the
  // same free agent is fine — free agents aren't exclusive across leagues.
  // (Two entries in the SAME league substituting the same free agent is also allowed:
  // free agents aren't exclusive between rosters once the draft is over.)
  const draft = await db.draft.findUnique({
    where: { leagueId: input.leagueId },
    select: { id: true },
  });
  const alreadyDrafted = draft
    ? await db.draftPick.findFirst({
        where: { draftId: draft.id, playerId: input.substitutePlayerId },
      })
    : null;
  if (alreadyDrafted) throw new InvalidSubstitutionError("that player is on another roster");

  // Within a single entry, though, a substitute may only stand in for ONE original —
  // otherwise the same player would score in two lineup slots at once.
  const alreadySubstituting = await db.substitution.findFirst({
    where: {
      entryId: input.entryId,
      substitutePlayerId: input.substitutePlayerId,
      NOT: { originalPlayerId: input.originalPlayerId },
    },
  });
  if (alreadySubstituting) {
    throw new InvalidSubstitutionError("that player is already substituting for someone on this team");
  }

  // Replacing a substitution for the same original updates in place.
  return db.substitution.upsert({
    where: {
      entryId_originalPlayerId: {
        entryId: input.entryId,
        originalPlayerId: input.originalPlayerId,
      },
    },
    create: {
      entryId: input.entryId,
      originalPlayerId: input.originalPlayerId,
      substitutePlayerId: input.substitutePlayerId,
      effectiveWeek: input.effectiveWeek,
      reason: input.reason ?? null,
    },
    update: {
      substitutePlayerId: input.substitutePlayerId,
      effectiveWeek: input.effectiveWeek,
      reason: input.reason ?? null,
    },
  });
}

export async function clearSubstitution(
  db: PrismaClient,
  input: { leagueId: string; userId: string; entryId: string; originalPlayerId: string },
) {
  await requireCommissionerWithSubsEnabled(db, input.leagueId, input.userId);
  await db.substitution.deleteMany({
    where: {
      entryId: input.entryId,
      originalPlayerId: input.originalPlayerId,
      entry: { leagueId: input.leagueId },
    },
  });
}
