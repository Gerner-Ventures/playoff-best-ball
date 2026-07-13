import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./analytics-events";

// Server-side capture for events that must not depend on the browser
// (webhooks, Inngest functions). Env-gated: unset key = silent no-op.
// flushAt 1 / flushInterval 0 so serverless invocations don't drop events.
const key = process.env.POSTHOG_KEY;
const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

const client = key ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 }) : null;

export async function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!client) return;
  try {
    client.capture({ distinctId, event, properties });
    await client.flush();
  } catch (err) {
    console.error("[analytics] capture failed", err); // never let analytics break a request
  }
}
