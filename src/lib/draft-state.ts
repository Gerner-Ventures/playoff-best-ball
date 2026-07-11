import type { PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "@/domain/league-settings";
import { draftOrderSchema, entryIdForPick, totalPicks } from "@/domain/draft/snake-order";

/** Everything the draft room needs per poll. Small by design — the player pool is fetched separately and cached. */
export async function getDraftState(db: PrismaClient, leagueId: string, userId: string) {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      draft: {
        include: {
          picks: {
            orderBy: { pickIndex: "asc" },
            include: { player: { select: { name: true, position: true, nflTeam: true } } },
          },
        },
      },
      entries: {
        orderBy: { createdAt: "asc" },
        include: { membership: { include: { user: { select: { name: true } } } } },
      },
    },
  });

  const settings = parseLeagueSettings(league.settings);
  const myEntry = league.entries.find((e) => e.membership.userId === userId) ?? null;

  if (!league.draft) {
    return {
      status: "NOT_STARTED" as const,
      entries: league.entries.map((e) => ({
        entryId: e.id,
        name: e.name,
        ownerName: e.membership.user.name,
      })),
      rosterSlots: settings.rosterSlots,
      myEntryId: myEntry?.id ?? null,
    };
  }

  const order = draftOrderSchema.parse(league.draft.order);
  const entryById = new Map(league.entries.map((e) => [e.id, e]));

  return {
    status: league.draft.status,
    currentPickIndex: league.draft.currentPickIndex,
    deadline: league.draft.currentDeadline?.toISOString() ?? null,
    totalPicks: totalPicks(order.length, settings.rosterSlots.length),
    onClockEntryId:
      league.draft.status === "ACTIVE" ? entryIdForPick(order, league.draft.currentPickIndex) : null,
    order: order.map((entryId) => ({
      entryId,
      name: entryById.get(entryId)?.name ?? "?",
      ownerName: entryById.get(entryId)?.membership.user.name ?? "?",
    })),
    picks: league.draft.picks.map((p) => ({
      pickIndex: p.pickIndex,
      entryId: p.entryId,
      playerId: p.playerId,
      playerName: p.player.name,
      position: p.player.position,
      nflTeam: p.player.nflTeam,
      slotIndex: p.slotIndex,
      autodrafted: p.autodrafted,
    })),
    rosterSlots: settings.rosterSlots,
    myEntryId: myEntry?.id ?? null,
  };
}

// NOTE: the union discriminates NOT_STARTED vs ACTIVE|COMPLETE (one branch carries both
// statuses). Extract<DraftState, {status:"ACTIVE"|"COMPLETE"}> selects the draft branch;
// a single-literal Extract (e.g. {status:"ACTIVE"}) is `never` — narrow with === instead.
export type DraftState = Awaited<ReturnType<typeof getDraftState>>;
