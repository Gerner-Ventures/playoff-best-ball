// Simulates a playoff week against the DEV database: every pooled player gets a
// deterministic stat line. Usage: npm run mock:week -- 1
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FakeStatsProvider } from "../src/domain/stats/fake-provider";
import { buildMockWeek } from "../src/domain/stats/mock-season";
import { syncWeekStats } from "../src/domain/stats/sync-week";
import { CURRENT_SEASON } from "../src/domain/season";

async function main() {
  const week = Number(process.argv[2]);
  if (![1, 2, 3, 4].includes(week)) throw new Error("usage: npm run mock:week -- <1|2|3|4>");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const players = await db.player.findMany({ where: { season: CURRENT_SEASON } });
  // ensure every player has an externalId so sync can match
  for (const p of players.filter((p) => !p.externalId)) {
    await db.player.update({ where: { id: p.id }, data: { externalId: `mock-${p.id}` } });
  }
  const withIds = players.map((p) => ({
    externalId: p.externalId ?? `mock-${p.id}`,
    name: p.name, position: p.position, nflTeam: p.nflTeam,
  }));
  const provider = new FakeStatsProvider(buildMockWeek(withIds, CURRENT_SEASON, week));
  const result = await syncWeekStats(db, provider, { season: CURRENT_SEASON, week });
  console.log(`Mock week ${week}:`, result);
  await db.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
