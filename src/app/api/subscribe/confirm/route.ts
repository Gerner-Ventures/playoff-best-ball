import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { confirmSubscription } from "@/domain/subscribers/confirm";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/** The confirm page's button posts here (a plain form, so it works without JavaScript). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const outcome = await confirmSubscription(db, { token: form?.get("token"), now: new Date() });

  if (outcome.result === "confirmed") {
    // Awaited but can never throw (captureServerEvent swallows errors).
    await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.SUBSCRIBE_CONFIRMED, { source: outcome.source });
  }
  const target =
    outcome.result === "confirmed" || outcome.result === "already_confirmed"
      ? "/subscribe/confirmed"
      : `/subscribe/confirm?status=${outcome.result}`;
  return NextResponse.redirect(new URL(target, req.url), 303);
}
