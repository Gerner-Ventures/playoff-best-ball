import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { updateNotificationSettings, getNotificationSettings } from "./notification-settings";

describe("notification settings", () => {
  beforeEach(resetDb);

  it("saves phone + opt-in and reads them back", async () => {
    const user = await createTestUser();
    await updateNotificationSettings(testDb, {
      userId: user.id, phone: "+15555550123", smsOptIn: true,
    });
    const settings = await getNotificationSettings(testDb, user.id);
    expect(settings).toMatchObject({ phone: "+15555550123", smsOptIn: true, pushDeviceCount: 0 });
  });

  it("clearing the phone always clears the opt-in", async () => {
    const user = await createTestUser();
    await updateNotificationSettings(testDb, {
      userId: user.id, phone: "+15555550123", smsOptIn: true,
    });
    await updateNotificationSettings(testDb, { userId: user.id, phone: null, smsOptIn: true });
    const settings = await getNotificationSettings(testDb, user.id);
    expect(settings).toMatchObject({ phone: null, smsOptIn: false });
  });

  it("counts push devices", async () => {
    const user = await createTestUser();
    await testDb.pushSubscription.create({
      data: { userId: user.id, endpoint: "https://push/e1", p256dh: "k", auth: "a" },
    });
    const settings = await getNotificationSettings(testDb, user.id);
    expect(settings.pushDeviceCount).toBe(1);
  });
});
