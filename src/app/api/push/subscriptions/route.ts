import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/domain/users/push-subscriptions";

// Shape of PushSubscription.toJSON() from the browser.
const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await savePushSubscription(db, {
    userId: user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

const deleteSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await removePushSubscription(db, { userId: user.id, endpoint: parsed.data.endpoint });
  return NextResponse.json({ ok: true });
}
