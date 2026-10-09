import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { ensureAccountSubscriber, getDigestPreference, setDigestPreference } from "./account";
import { newToken } from "./tokens";
import { unsubscribeByToken } from "./unsubscribe";
import { requestSubscription } from "./subscribe";
import { at, fakeSender, TEST_URLS } from "./test-support";

async function formRow(email: string, status: "PENDING" | "ACTIVE" | "UNSUBSCRIBED") {
  return testDb.emailSubscriber.create({ data: { email, source: "footer", status, unsubscribeToken: newToken() } });
}

/**
 * A `db` whose emailSubscriber.findUnique runs `race` once, right after the first
 * call with a `where.email` resolves and before ensureAccountSubscriber's own
 * writes execute — deterministically reproducing "something else changes this row
 * between the by-email read and the link writes".
 */
function racingDb(race: () => Promise<unknown>): PrismaClient {
  let fired = false;
  return {
    emailSubscriber: {
      findUnique: async (args: Parameters<typeof testDb.emailSubscriber.findUnique>[0]) => {
        const result = await testDb.emailSubscriber.findUnique(args);
        if (!fired && args?.where && "email" in args.where && args.where.email !== undefined) {
          fired = true;
          await race();
        }
        return result;
      },
      updateMany: testDb.emailSubscriber.updateMany.bind(testDb.emailSubscriber),
      update: testDb.emailSubscriber.update.bind(testDb.emailSubscriber),
      create: testDb.emailSubscriber.create.bind(testDb.emailSubscriber),
    },
  } as unknown as PrismaClient;
}

describe("ensureAccountSubscriber", () => {
  beforeEach(resetDb);

  it("creates an ACTIVE account row for a new user", async () => {
    const user = await createTestUser("New");
    const row = await ensureAccountSubscriber(testDb, user, at(0));
    expect(row).toMatchObject({ userId: user.id, email: user.email.toLowerCase(), status: "ACTIVE", source: "account" });
  });

  it("is idempotent", async () => {
    const user = await createTestUser("Twice");
    const a = await ensureAccountSubscriber(testDb, user);
    const b = await ensureAccountSubscriber(testDb, user);
    expect(b?.id).toBe(a?.id);
    expect(await testDb.emailSubscriber.count()).toBe(1);
  });

  it("links a PENDING form signup and activates it, because signing in proves the address", async () => {
    const user = await createTestUser("Fan");
    await formRow(user.email.toLowerCase(), "PENDING");
    const row = await ensureAccountSubscriber(testDb, { id: user.id, email: `  ${user.email.toUpperCase()} ` }, at(0));
    expect(row).toMatchObject({ userId: user.id, status: "ACTIVE", source: "footer" });
  });

  it("links but never resubscribes an UNSUBSCRIBED address", async () => {
    const user = await createTestUser("Gone");
    await formRow(user.email.toLowerCase(), "UNSUBSCRIBED");
    const row = await ensureAccountSubscriber(testDb, user);
    expect(row).toMatchObject({ userId: user.id, status: "UNSUBSCRIBED" });
  });

  it("links a prior ACTIVE form row, keeping both its status and its source", async () => {
    const user = await createTestUser("Active");
    await formRow(user.email.toLowerCase(), "ACTIVE");
    const row = await ensureAccountSubscriber(testDb, user);
    expect(row).toMatchObject({ userId: user.id, status: "ACTIVE", source: "footer" });
  });

  it("never resubscribes without re-consent: a form resignup after an unsubscribe stays PENDING on sign-in", async () => {
    const user = await createTestUser("Resignup");
    const email = user.email.toLowerCase();
    await testDb.emailSubscriber.create({
      data: { email, source: "footer", status: "UNSUBSCRIBED", unsubscribeToken: newToken(), unsubscribedAt: at(0) },
    });

    // Someone (anyone) resubmits the address through the form; it goes back to PENDING,
    // but unsubscribedAt is left behind on the row until a confirm click clears it.
    const mail = fakeSender();
    await requestSubscription(testDb, mail.sender, TEST_URLS, { email, source: "footer", now: at(1) });
    const resubmitted = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email } });
    expect(resubmitted).toMatchObject({ status: "PENDING" });
    expect(resubmitted.unsubscribedAt).not.toBeNull();

    const row = await ensureAccountSubscriber(testDb, { id: user.id, email }, at(2));

    // Signing in links the row, but must not activate it — that would undo the
    // unsubscribe without the address ever re-proving consent via a confirm click.
    expect(row).toMatchObject({ userId: user.id, status: "PENDING" });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email } });
    expect(after).toMatchObject({ userId: user.id, status: "PENDING" });
  });

  it("leaves an address held by a different account alone", async () => {
    const owner = await createTestUser("Owner");
    await ensureAccountSubscriber(testDb, owner);
    const other = await createTestUser("Other");
    expect(await ensureAccountSubscriber(testDb, { id: other.id, email: owner.email })).toBeNull();
  });

  it("never reactivates a PENDING row that an unsubscribe raced between the read and the write", async () => {
    const user = await createTestUser("Racer");
    const formEmail = user.email.toLowerCase();
    const row = await formRow(formEmail, "PENDING");
    const db = racingDb(() => unsubscribeByToken(testDb, { token: row.unsubscribeToken, now: at(6) }));

    const result = await ensureAccountSubscriber(db, { id: user.id, email: formEmail }, at(0));

    // The row is linked (signing in proved the address is this account's) but the
    // concurrent unsubscribe still wins: it must not be overwritten back to ACTIVE.
    expect(result).toMatchObject({ userId: user.id, status: "UNSUBSCRIBED" });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ userId: user.id, status: "UNSUBSCRIBED" });
  });
});

describe("digest preference", () => {
  beforeEach(resetDb);

  it("repairs a missing row and reports on-by-default", async () => {
    const user = await createTestUser("Missing");
    expect(await getDigestPreference(testDb, user)).toBe(true);
    expect(await testDb.emailSubscriber.count()).toBe(1);
  });

  it("turns off and back on", async () => {
    const user = await createTestUser("Toggle");
    expect(await setDigestPreference(testDb, user, false, at(1))).toBe(false);
    const off = await testDb.emailSubscriber.findUniqueOrThrow({ where: { userId: user.id } });
    expect(off).toMatchObject({ status: "UNSUBSCRIBED", unsubscribedAt: at(1) });

    expect(await setDigestPreference(testDb, user, true, at(2))).toBe(true);
    const on = await testDb.emailSubscriber.findUniqueOrThrow({ where: { userId: user.id } });
    expect(on).toMatchObject({ status: "ACTIVE", unsubscribedAt: null });
  });

  it("reports off, and changes nothing, when another account holds the address", async () => {
    const owner = await createTestUser("Owner");
    await ensureAccountSubscriber(testDb, owner);
    const other = { id: (await createTestUser("Other")).id, email: owner.email };
    expect(await getDigestPreference(testDb, other)).toBe(false);
    expect(await setDigestPreference(testDb, other, true)).toBe(false);
  });
});
