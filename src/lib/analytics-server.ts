import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./analytics-events";

const key = process.env.POSTHOG_PROJECT_TOKEN;
const host = process.env.POSTHOG_HOST;

if ((!key || !host) && process.env.NODE_ENV === "development") {
  const missingVariable = key ? "POSTHOG_HOST" : "POSTHOG_PROJECT_TOKEN";
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

const client = key && host ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 }) : null;

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
    console.error("[analytics] capture failed", err);
  }
}
