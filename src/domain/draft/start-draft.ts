import { Prisma, type PrismaClient } from "@prisma/client";
import {
  DraftAlreadyStartedError,
  InsufficientPlayerPoolError,
  NotCommissionerError,
  TooFewEntriesError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";
import { computePickDeadline } from "./pick-clock";
import { shuffleOrder } from "./snake-order";

export interface StartDraftInput {
  leagueId: string;
  userId: string;
  /** Optional explicit round-1 order (entryIds); randomized when omitted. */
  order?: string[];
}

export async function startDraft(db: PrismaClient, input: StartDraftInput) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();

  const league = await db.league.findUniqueOrThrow({
    where: { id: input.leagueId },
    include: { entries: true, draft: true },
  });
  if (league.draft) throw new DraftAlreadyStartedError();
  if (league.entries.length < 2) throw new TooFewEntriesError();

  const entryIds = league.entries.map((e) => e.id);
  const order = input.order ?? shuffleOrder(entryIds);
  const isPermutation =
    order.length === entryIds.length && [...order].sort().join() === [...entryIds].sort().join();
  if (!isPermutation) {
    throw new Error("order must contain each entry exactly once");
  }

  const settings = parseLeagueSettings(league.settings);

  // The pool must be able to fill every roster or the draft wedges mid-way
  // (autodraft finds no legal player; humans get NO_SLOT_FOR_POSITION forever).
  const pool = await db.player.groupBy({
    by: ["position"],
    where: { season: league.season },
    _count: { _all: true },
  });
  const available = new Map(pool.map((g) => [g.position, g._count._all]));
  const entriesCount = league.entries.length;
  let flexEligibleSurplus = 0;
  for (const slotType of ["QB", "RB", "WR", "TE", "K", "DST"] as const) {
    const needed = settings.rosterSlots.filter((s) => s.slot === slotType).length * entriesCount;
    const have = available.get(slotType) ?? 0;
    if (have < needed) throw new InsufficientPlayerPoolError();
    if (slotType === "RB" || slotType === "WR" || slotType === "TE") {
      flexEligibleSurplus += have - needed;
    }
  }
  const flexNeeded = settings.rosterSlots.filter((s) => s.slot === "FLEX").length * entriesCount;
  if (flexEligibleSurplus < flexNeeded) throw new InsufficientPlayerPoolError();

  const deadline = computePickDeadline(new Date(), settings.pickClockHours, settings.overnightPause);

  try {
    return await db.draft.create({
      data: {
        leagueId: league.id,
        status: "ACTIVE",
        currentPickIndex: 0,
        currentDeadline: deadline,
        order: order as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Two simultaneous starts: loser hits the unique leagueId constraint.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DraftAlreadyStartedError();
    }
    throw err;
  }
}
