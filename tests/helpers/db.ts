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

// Deliberately never truncated.
//
// DemoEnvironment marks a database as a demo database (see src/lib/demo-mode.ts).
// It is a property of the database, not of any test's data — wiping it would
// silently downgrade a demo database on the next reset and turn password sign-in
// off. tests/demo-mode-integration.test.ts pins this.
const PRESERVED_TABLES = ["_prisma_migrations", "DemoEnvironment"];

let truncateStatement: string | null = null;

/**
 * One TRUNCATE, not twenty deletes.
 *
 * This runs before every test in a 300+ test suite, so the round trips dominated
 * it — that cost is what put the suite close enough to Vitest's timeout for CI to
 * cross it intermittently.
 *
 * The table list comes from the database rather than a hand-written array:
 * CASCADE removes the need to order children before parents, and a newly added
 * model is covered automatically instead of being silently skipped until someone
 * remembers to update this file.
 */
export async function resetDb() {
  if (!truncateStatement) {
    const rows = await testDb.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const tables = rows
      .map((r) => r.tablename)
      .filter((t) => !PRESERVED_TABLES.includes(t))
      .map((t) => `"public"."${t}"`);
    if (tables.length === 0) throw new Error("resetDb found no tables — is the test database migrated?");
    truncateStatement = `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`;
  }
  await testDb.$executeRawUnsafe(truncateStatement);
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

/**
 * A pool big enough to fully draft `entryCount` standard 9-slot rosters.
 *
 * One createMany, not ~130 awaited inserts. Callers still get the rows back in
 * insertion order, which `defaultRank` encodes, so ordering semantics are
 * unchanged from the row-at-a-time version this replaced.
 */
export async function createStandardPool(entryCount: number) {
  const counts: [PlayerPosition, number][] = [
    ["QB", 2 * entryCount],
    ["RB", 3 * entryCount],
    ["WR", 3 * entryCount],
    ["TE", 2 * entryCount],
    ["K", entryCount + 1],
    ["DST", entryCount + 1],
  ];
  const data = [];
  for (const [position, n] of counts) {
    for (let i = 0; i < n; i++) {
      playerCounter += 1;
      data.push({
        season: CURRENT_SEASON,
        name: `Player ${playerCounter} (${position})`,
        position,
        nflTeam: "KC",
        defaultRank: playerCounter,
      });
    }
  }
  await testDb.player.createMany({ data });
  return testDb.player.findMany({
    where: { name: { in: data.map((d) => d.name) } },
    orderBy: { defaultRank: "asc" },
  });
}
