import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getDigestPreference, setDigestPreference } from "@/domain/subscribers/account";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const bodySchema = z.object({ digest: z.boolean() });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ digest: await getDigestPreference(db, user) });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const before = await getDigestPreference(db, user);
  const digest = await setDigestPreference(db, user, parsed.data.digest);
  if (before && !parsed.data.digest) {
    await captureServerEvent(user.id, ANALYTICS_EVENTS.UNSUBSCRIBED, { via: "settings" });
  }
  return NextResponse.json({ digest });
}
