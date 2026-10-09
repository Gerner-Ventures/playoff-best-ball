"use client";

import posthog from "posthog-js";
import type { AnalyticsEvent } from "./analytics-events";

/** Browser-side custom events. Never throws: analytics must not break a click. */
export function captureClientEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  try {
    posthog.capture(event, properties);
  } catch (err) {
    console.error("[analytics] client capture failed", err);
  }
}
