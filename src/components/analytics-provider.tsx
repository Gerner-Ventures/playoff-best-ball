"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Pageview + autocapture only; explicit client events can use posthog.capture later.
// Env-gated: no key at build time = renders children with no analytics.
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);
  return <>{children}</>;
}
