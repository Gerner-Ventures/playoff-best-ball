import type { PrismaClient } from "@prisma/client";

export interface SavePushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Upsert by endpoint: browsers rotate keys, and shared computers reassign to the latest user. */
export async function savePushSubscription(db: PrismaClient, input: SavePushSubscriptionInput) {
  return db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: input,
    update: { userId: input.userId, p256dh: input.p256dh, auth: input.auth },
  });
}

export async function removePushSubscription(
  db: PrismaClient,
  input: { userId: string; endpoint: string },
) {
  await db.pushSubscription.deleteMany({
    where: { endpoint: input.endpoint, userId: input.userId },
  });
}
