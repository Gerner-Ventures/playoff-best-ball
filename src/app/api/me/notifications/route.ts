import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "@/domain/users/notification-settings";

const E164 = /^\+[1-9]\d{6,14}$/;

const bodySchema = z.object({
  phone: z
    .string()
    .regex(E164, "Use international format, e.g. +15555550123")
    .nullable(),
  smsOptIn: z.boolean(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(await getNotificationSettings(db, user.id));
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const settings = await updateNotificationSettings(db, { userId: user.id, ...parsed.data });
  return NextResponse.json(settings);
}
