import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedPlayers, PLAYERS_FIXTURE } from "../prisma/seed-players";

export default async function globalSetup() {
  const pool = new Pool({
    connectionString: "postgresql://pbb:pbb@localhost:5433/pbb_test",
  });
  const adapter = new PrismaPg(pool);
  const db = new PrismaClient({ adapter });
  await seedPlayers(db, PLAYERS_FIXTURE);
  await db.$disconnect();
  await pool.end();
}
