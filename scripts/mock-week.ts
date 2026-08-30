// Thin CLI wrapper around advanceMockWeek: plays the next playoff week against
// the DEV database.
//
// Usage: npm run mock:week                        — auto-advances 1 → 4
//        npm run mock:week -- --source=historical:2024
//
// With no --source it behaves exactly as it always has: a fabricated week with a
// deterministic stat line for every pooled player. With one, it plays the next
// week of that season instead — the same lever, a different season underneath.
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceMockWeek } from "../src/domain/stats/mock-season";
import { resolveSeasonSource, sourceIdFromInput, detectSeasonSource } from "../src/domain/stats/sources/resolve";
import { CURRENT_SEASON } from "../src/domain/season";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const flag = process.argv.slice(2).find((a) => a.startsWith("--source="))?.split("=")[1];
  // Default to whatever source the season already holds, so advancing a demo
  // seeded from a captured season keeps playing that season rather than
  // fabricating on top of it (which advanceMockWeek would refuse anyway).
  const sourceId = sourceIdFromInput(flag ?? (await detectSeasonSource(db, CURRENT_SEASON)) ?? undefined);
  const source = await resolveSeasonSource(db, sourceId, CURRENT_SEASON);

  const result = await advanceMockWeek(db, { season: CURRENT_SEASON, source });
  // Legacy positional week arg. Only a bare number counts — otherwise `--source=`
  // would parse as NaN and warn on every run.
  const positional = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const requested = positional ? Number(positional) : null;
  if (requested !== null && requested !== result.week) {
    console.warn(`note: the mock season auto-advances now — simulated week ${result.week}, not ${requested}`);
  }
  console.log(`Played week ${result.week} from ${sourceId}:`, result);
  await db.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
