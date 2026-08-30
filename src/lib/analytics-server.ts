import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./analytics-events";

const key = process.env.POSTHOG_PROJECT_TOKEN;
const host = process.env.POSTHOG_HOST;

// Warn, never throw. This runs at module scope, so a throw here doesn't just skip
// analytics — it fails the import for every route that captures an event
// (draft/pick, draft, entries, league settings, me/notifications, mock-draft),
// turning "no analytics key" into "those endpoints 500". Same reasoning as
// instrumentation-client.ts: unset means the feature is off, per
// docs/runbooks/production-setup.md.
if ((!key || !host) && process.env.NODE_ENV === "development") {
  const missingVariable = key ? "POSTHOG_HOST" : "POSTHOG_PROJECT_TOKEN";
  console.warn(
    `${missingVariable} is missing or un-configured — PostHog server analytics are OFF and events are silently dropped. This warning stops once ${missingVariable} is set.`,
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
