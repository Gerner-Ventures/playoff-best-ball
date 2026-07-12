import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { savePushSubscription, removePushSubscription } from "./push-subscriptions";

const SUB = { endpoint: "https://push.example/abc", p256dh: "key", auth: "auth" };

describe("push subscriptions", () => {
  beforeEach(resetDb);

  it("saves and is idempotent per endpoint", async () => {
    const user = await createTestUser();
    await savePushSubscription(testDb, { userId: user.id, ...SUB });
    await savePushSubscription(testDb, { userId: user.id, ...SUB, p256dh: "rotated" });
    const rows = await testDb.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("rotated");
  });

  it("re-subscribing the same browser under a new user reassigns it", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    await savePushSubscription(testDb, { userId: a.id, ...SUB });
    await savePushSubscription(testDb, { userId: b.id, ...SUB });
    const rows = await testDb.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.id); // shared computer: last sign-in owns the endpoint
  });

  it("removes only the caller's subscription", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    await savePushSubscription(testDb, { userId: a.id, ...SUB });
    await removePushSubscription(testDb, { userId: b.id, endpoint: SUB.endpoint }); // no-op
    expect(await testDb.pushSubscription.count()).toBe(1);
    await removePushSubscription(testDb, { userId: a.id, endpoint: SUB.endpoint });
    expect(await testDb.pushSubscription.count()).toBe(0);
  });
});
