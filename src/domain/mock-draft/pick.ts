import type { PrismaClient } from "@prisma/client";
import {
  DraftNotActiveError,
  NotYourTurnError,
  PlayerUnavailableError,
  NoSlotForPositionError,
} from "../errors";
import { assignSlot } from "../draft/slot-assignment";
import { advanceThroughBots, loadPool, readMock, seatForPick } from "./engine";

export interface MockPickInput {
  userId: string;
  playerId: string;
  rng?: () => number;
}

/**
 * The user's pick, then bots run to their next turn. Slot assignment mirrors the
 * real draft exactly — you choose a player, the slot is derived from its position
 * — so practising here teaches the real behaviour, including its refusals.
 */
export async function makeMockPick(db: PrismaClient, input: MockPickInput) {
  const mock = await db.mockDraft.findUnique({ where: { userId: input.userId } });
  if (!mock) throw new DraftNotActiveError();
  if (mock.status !== "ACTIVE") throw new DraftNotActiveError();

  const { config, order, picks } = readMock(mock);
  if (seatForPick(order, mock.currentPickIndex) !== mock.humanSeat) throw new NotYourTurnError();

  const taken = new Set(picks.map((p) => p.playerId));
  if (taken.has(input.playerId)) throw new PlayerUnavailableError();

  const player = await db.player.findUnique({ where: { id: input.playerId } });
  if (!player || player.season !== mock.season) throw new PlayerUnavailableError();

  const filled = picks.filter((p) => p.seat === mock.humanSeat).map((p) => p.slotIndex);
  const slotIndex = assignSlot(config.rosterSlots, filled, player.position);
  if (slotIndex === null) throw new NoSlotForPositionError(player.position);

  const withMine = [
    ...picks,
    { pickIndex: mock.currentPickIndex, seat: mock.humanSeat, playerId: player.id, slotIndex },
  ];

  const pool = await loadPool(db, mock.season);
  const advanced = advanceThroughBots(
    {
      order,
      humanSeat: mock.humanSeat,
      rosterSlots: config.rosterSlots,
      picks: withMine,
      currentPickIndex: mock.currentPickIndex + 1,
    },
    pool,
    input.rng,
  );

  return db.mockDraft.update({
    where: { userId: input.userId },
    data: {
      picks: advanced.picks,
      currentPickIndex: advanced.currentPickIndex,
      status: advanced.complete ? "COMPLETE" : "ACTIVE",
    },
  });
}
