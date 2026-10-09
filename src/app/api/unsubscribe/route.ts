import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unsubscribeByToken } from "@/domain/subscribers/unsubscribe";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * Two POST callers:
 *  - the /unsubscribe page's button: form field `token`, answered with a 303 back to the page
 *  - mail clients' one-click (RFC 8058): token in the query string, body
 *    `List-Unsubscribe=One-Click`, answered with a bare 200/404 and no page
 *
 * Plus a GET: some mail clients open the List-Unsubscribe URL in a browser instead of
 * POSTing. That must never unsubscribe anyone on its own (a link prefetcher could visit it
 * too) — it only bounces to the human page, which POSTs for real.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const target = token ? `/unsubscribe?token=${encodeURIComponent(token)}` : "/unsubscribe";
  return NextResponse.redirect(new URL(target, req.url), 303);
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const formToken = form?.get("token");

  if (typeof formToken === "string") {
    const outcome = await unsubscribeByToken(db, { token: formToken, now: new Date() });
    if (outcome.result === "unsubscribed") {
      // $process_person_profile: false — this event is keyed by subscriberId, not a real
      // PostHog person; per-source counts are what the funnel needs (identity joining is
      // deferred), and without this flag PostHog would create a person per subscriber.
      await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.UNSUBSCRIBED, {
        via: "link",
        $process_person_profile: false,
      });
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
    await captureServerEvent(outcome.subscriberId, ANALYTICS_EVENTS.UNSUBSCRIBED, {
      via: "one_click",
      $process_person_profile: false,
    });
  }
  return NextResponse.json({ ok: true });
}
