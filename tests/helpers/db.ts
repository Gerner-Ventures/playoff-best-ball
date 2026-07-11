import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

function makeTestPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const testDb = makeTestPrismaClient(); // DATABASE_URL comes from .env.test via dotenv-cli

export async function resetDb() {
  // Order matters: children before parents (cascades cover most, be explicit anyway)
  await testDb.entry.deleteMany();
  await testDb.membership.deleteMany();
  await testDb.league.deleteMany();
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
