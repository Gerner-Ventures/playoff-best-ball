import { PrismaClient, Prisma } from "@prisma/client";
import type { PlayerPosition } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { CURRENT_SEASON } from "@/domain/season";
import { emptyStatLine, type StatLine } from "@/domain/stats/stat-line";

function makeTestPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({ adapter });
}

export const testDb = makeTestPrismaClient(); // DATABASE_URL comes from .env.test via dotenv-cli

export async function resetDb() {
  // Order matters: children before parents (cascades cover most, be explicit anyway)
  await testDb.substitution.deleteMany();
  await testDb.draftQueueItem.deleteMany();
  await testDb.draftPick.deleteMany();
  await testDb.draft.deleteMany();
  await testDb.entry.deleteMany();
  await testDb.membership.deleteMany();
  await testDb.duesCollectionInterest.deleteMany();
  await testDb.leaguePurchase.deleteMany();
  await testDb.league.deleteMany();
  await testDb.playerStat.deleteMany();
  await testDb.syncHealth.deleteMany();
  await testDb.nflGame.deleteMany();
  await testDb.teamOdds.deleteMany();
  await testDb.player.deleteMany();
  await testDb.pushSubscription.deleteMany();
  await testDb.session.deleteMany();
  await testDb.account.deleteMany();
  await testDb.verification.deleteMany();
  await testDb.user.deleteMany();
}

export async function createTestUser(name = "Test User") {
  return testDb.user.create({
    data: {
      id: randomUUID(),
      name,
      email: `${randomUUID()}@example.com`,
    },
  });
}

let playerCounter = 0;

/** Creates a player with a unique name; lower defaultRank = drafted earlier by fallback autodraft. */
export async function createTestPlayer(
  position: PlayerPosition,
  overrides: { defaultRank?: number; name?: string; season?: number } = {},
) {
  playerCounter += 1;
  return testDb.player.create({
    data: {
      season: overrides.season ?? CURRENT_SEASON,
      name: overrides.name ?? `Player ${playerCounter} (${position})`,
      position,
      nflTeam: "KC",
      defaultRank: overrides.defaultRank ?? playerCounter,
    },
  });
}

/** Upserts a stat line for a player-week; partial overrides merge over an empty line. */
export async function setTestStat(
  playerId: string,
  week: number,
  overrides: Partial<StatLine>,
  season = CURRENT_SEASON,
) {
  const stats = { ...emptyStatLine(), ...overrides };
  return testDb.playerStat.upsert({
    where: { playerId_season_week: { playerId, season, week } },
    create: { playerId, season, week, stats: stats as Prisma.InputJsonValue },
    update: { stats: stats as Prisma.InputJsonValue },
  });
}

/** A pool big enough to fully draft `entryCount` standard 9-slot rosters. */
export async function createStandardPool(entryCount: number) {
  const counts: [PlayerPosition, number][] = [
    ["QB", 2 * entryCount],
    ["RB", 3 * entryCount],
    ["WR", 3 * entryCount],
    ["TE", 2 * entryCount],
    ["K", entryCount + 1],
    ["DST", entryCount + 1],
  ];
  const players = [];
  for (const [position, n] of counts) {
    for (let i = 0; i < n; i++) players.push(await createTestPlayer(position));
  }
  return players;
}
