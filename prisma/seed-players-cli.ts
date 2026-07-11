import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedPlayers, PLAYERS_FIXTURE } from "./seed-players";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const adapter = new PrismaPg(pool);
  const db = new PrismaClient({ adapter });
  const count = await seedPlayers(db, PLAYERS_FIXTURE);
  console.log(`Seeded ${count} players`);
  await db.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
