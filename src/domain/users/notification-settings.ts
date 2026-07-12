import type { PrismaClient } from "@prisma/client";

export interface UpdateNotificationSettingsInput {
  userId: string;
  /** E.164 (validated at the route); null clears the number AND the opt-in. */
  phone: string | null;
  smsOptIn: boolean;
}

export async function updateNotificationSettings(
  db: PrismaClient,
  input: UpdateNotificationSettingsInput,
) {
  const smsOptIn = input.phone ? input.smsOptIn : false;
  return db.user.update({
    where: { id: input.userId },
    data: { phone: input.phone, smsOptIn },
    select: { phone: true, smsOptIn: true },
  });
}

export async function getNotificationSettings(db: PrismaClient, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { phone: true, smsOptIn: true, _count: { select: { pushSubscriptions: true } } },
  });
  return { phone: user.phone, smsOptIn: user.smsOptIn, pushDeviceCount: user._count.pushSubscriptions };
}
