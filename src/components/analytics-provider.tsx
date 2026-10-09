"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";

/**
 * Identifies signed-in users to PostHog from the browser. The root layout used to
 * pass the user down from a server-side session read, which made every page,
 * marketing included, render per request.
 */
export function AnalyticsIdentity() {
  const { data } = authClient.useSession();
  const user = data?.user;

  useEffect(() => {
    if (user) posthog.identify(user.id, { email: user.email, name: user.name });
  }, [user]);

  return null;
}
