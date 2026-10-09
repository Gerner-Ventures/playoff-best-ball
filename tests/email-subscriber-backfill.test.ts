import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { testDb, resetDb, createTestUser } from "./helpers/db";

/**
 * The backfill runs once, at deploy, against production users. It is tested by
 * re-running the exact SQL from the migration file, so the test and the migration
 * cannot drift apart.
 */
function backfillSql(): string {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261009120000_email_subscriber/migration.sql"),
    "utf8",
  );
  const match = sql.match(/-- backfill:begin\n([\s\S]*?)-- backfill:end/);
  if (!match) throw new Error("backfill markers not found in migration.sql");
  return match[1];
}

describe("EmailSubscriber account backfill", () => {
  beforeEach(resetDb);

  it("gives every existing user one ACTIVE account row with a unique 64-hex token", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");

    await testDb.$executeRawUnsafe(backfillSql());

    const rows = await testDb.emailSubscriber.findMany();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("ACTIVE");
      expect(row.source).toBe("account");
      expect(row.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
      expect(row.confirmedAt).not.toBeNull();
    }
    expect(new Set(rows.map((r) => r.unsubscribeToken)).size).toBe(2);
    expect(rows.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
  });

  it("stores the address trimmed and lowercased", async () => {
    const user = await testDb.user.create({
      data: { id: randomUUID(), name: "Caps", email: "  Caps@Example.COM " },
    });

    await testDb.$executeRawUnsafe(backfillSql());

    const row = await testDb.emailSubscriber.findUnique({ where: { email: "caps@example.com" } });
    expect(row?.userId).toBe(user.id);
  });

  it("leaves an address that is already on the list alone", async () => {
    const user = await createTestUser("Already");
    await testDb.emailSubscriber.create({
      data: {
        email: user.email.toLowerCase(),
        source: "footer",
        status: "UNSUBSCRIBED",
        unsubscribeToken: "u".repeat(43),
      },
    });

    await testDb.$executeRawUnsafe(backfillSql());

    const row = await testDb.emailSubscriber.findUnique({ where: { email: user.email.toLowerCase() } });
    expect(row?.status).toBe("UNSUBSCRIBED");
    expect(row?.userId).toBeNull();
  });
});
