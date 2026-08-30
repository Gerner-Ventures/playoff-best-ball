"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export function AnalyticsIdentity({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name: string;
}) {
  useEffect(() => {
    posthog.identify(userId, { email, name });
  }, [userId, email, name]);

  return null;
}
