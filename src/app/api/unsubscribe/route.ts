import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unsubscribeByToken } from "@/domain/subscribers/unsubscribe";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * Two callers:
 *  - the /unsubscribe page's button: form field `token`, answered with a 303 back to the page
 *  - mail clients' one-click (RFC 8058): token in the query string, body
 *    `List-Unsubscribe=One-Click`, answered with a bare 200/404 and no page
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const formToken = form?.get("token");

  if (typeof formToken === "string") {
    const outcome = await unsubscribeByToken(db, { token: formToken, now: new Date() });
    if (outcome.result === "unsubscribed") {
      await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.UNSUBSCRIBED, { via: "link" });
    }
    const status = outcome.result === "invalid" ? "invalid" : "unsubscribed";
    return NextResponse.redirect(
      new URL(`/unsubscribe?token=${encodeURIComponent(formToken)}&status=${status}`, req.url),
      303,
    );
  }

  const outcome = await unsubscribeByToken(db, { token: new URL(req.url).searchParams.get("token"), now: new Date() });
  if (outcome.result === "invalid") return NextResponse.json({ error: "Unknown unsubscribe link" }, { status: 404 });
  if (outcome.result === "unsubscribed") {
    await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.UNSUBSCRIBED, { via: "one_click" });
  }
  return NextResponse.json({ ok: true });
}
