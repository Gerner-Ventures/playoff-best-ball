// Thin CLI wrapper around advanceMockWeek: simulates the next playoff week
// against the DEV database (every pooled player gets a deterministic stat line).
// Usage: npm run mock:week  — the mock season auto-advances 1 → 4.
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceMockWeek } from "../src/domain/stats/mock-season";
import { CURRENT_SEASON } from "../src/domain/season";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const result = await advanceMockWeek(db, { season: CURRENT_SEASON });
  const requested = process.argv[2] ? Number(process.argv[2]) : null;
  if (requested !== null && requested !== result.week) {
    console.warn(`note: the mock season auto-advances now — simulated week ${result.week}, not ${requested}`);
  }
  console.log(`Mock week ${result.week}:`, result);
  await db.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
