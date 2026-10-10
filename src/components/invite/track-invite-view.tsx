"use client";

import { useEffect } from "react";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * No explicit properties on this event — PostHog's automatic URL properties already
 * include the invite code, the same way $pageview does (spec §8.1).
 */
export function TrackInviteView() {
  useEffect(() => captureClientEvent(ANALYTICS_EVENTS.INVITE_PAGE_VIEWED), []);
  return null;
}
