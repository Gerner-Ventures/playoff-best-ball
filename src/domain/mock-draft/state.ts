import type { PrismaClient } from "@prisma/client";
import { totalPicks } from "../draft/snake-order";
import { readMock, seatForPick } from "./engine";

/** Everything the mock draft screen renders, in one round trip. */
export async function getMockDraftState(db: PrismaClient, userId: string) {
  const mock = await db.mockDraft.findUnique({ where: { userId } });
  if (!mock) return null;

  const { config, order, picks } = readMock(mock);
  const players = await db.player.findMany({
    where: { season: mock.season },
    orderBy: { defaultRank: "asc" },
    select: { id: true, name: true, position: true, nflTeam: true, defaultRank: true },
  });
  const byId = new Map(players.map((p) => [p.id, p]));
  const taken = new Set(picks.map((p) => p.playerId));

  return {
    status: mock.status,
    humanSeat: mock.humanSeat,
    order,
    teamCount: config.teamCount,
    rosterSlots: config.rosterSlots,
    currentPickIndex: mock.currentPickIndex,
    totalPicks: totalPicks(order.length, config.rosterSlots.length),
    onTheClock:
      mock.status === "ACTIVE" ? seatForPick(order, mock.currentPickIndex) : null,
    picks: picks.map((p) => ({ ...p, player: byId.get(p.playerId) ?? null })),
    myRoster: config.rosterSlots.map((slot, slotIndex) => {
      const pick = picks.find((p) => p.seat === mock.humanSeat && p.slotIndex === slotIndex);
      return { slotIndex, slot: slot.slot, player: pick ? (byId.get(pick.playerId) ?? null) : null };
    }),
    available: players.filter((p) => !taken.has(p.id)),
  };
}
