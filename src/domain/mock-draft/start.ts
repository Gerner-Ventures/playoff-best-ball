import type { PrismaClient } from "@prisma/client";
import { shuffleOrder } from "../draft/snake-order";
import { mockDraftConfigSchema, type MockDraftConfig } from "./config";
import { advanceThroughBots, loadPool } from "./engine";

export interface StartMockDraftInput {
  userId: string;
  season: number;
  config: MockDraftConfig;
  rng?: () => number;
}

/**
 * Creates the user's mock draft, replacing any in progress — "one at a time" is
 * enforced by the unique userId, so this is an upsert rather than a check.
 * Draft position is randomised, then bots run up to the user's first turn.
 */
export async function startMockDraft(db: PrismaClient, input: StartMockDraftInput) {
  const config = mockDraftConfigSchema.parse(input.config);
  const seats = Array.from({ length: config.teamCount }, (_, i) => String(i));
  const order = shuffleOrder(seats);
  const humanSeat = order[Math.floor((input.rng ?? Math.random)() * order.length)];

  const pool = await loadPool(db, input.season);
  const advanced = advanceThroughBots(
    { order, humanSeat, rosterSlots: config.rosterSlots, picks: [], currentPickIndex: 0 },
    pool,
    input.rng,
  );

  const data = {
    season: input.season,
    config,
    order,
    humanSeat,
    picks: advanced.picks,
    currentPickIndex: advanced.currentPickIndex,
    status: advanced.complete ? ("COMPLETE" as const) : ("ACTIVE" as const),
  };

  return db.mockDraft.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data,
  });
}

export async function discardMockDraft(db: PrismaClient, userId: string) {
  await db.mockDraft.deleteMany({ where: { userId } });
}
