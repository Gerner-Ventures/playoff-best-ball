"use client";

import { useEffect } from "react";
import { captureClientEvent } from "@/lib/analytics-client";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/** No league identifiers in the event, on purpose (spec §8.1). */
export function TrackInviteView() {
  useEffect(() => captureClientEvent(ANALYTICS_EVENTS.INVITE_PAGE_VIEWED), []);
  return null;
}
