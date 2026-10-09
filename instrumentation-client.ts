import posthog, { type BeforeSendFn, type CaptureResult } from "posthog-js";
import { scrubTokens } from "@/lib/analytics-scrub";

// scrubTokens<T> is generic so analytics-scrub.ts stays import-free and
// framework-agnostic; this wrapper pins T to posthog-js's own CaptureResult so
// its type lines up with BeforeSendFn directly, rather than leaning on TS to
// infer the generic through a bare assignment to `before_send`.
const beforeSend: BeforeSendFn = (event: CaptureResult | null) => scrubTokens(event);

const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!key || !host) {
  // Warn, never throw. This module runs as the client instrumentation hook, so a
  // throw here takes hydration down with it and every interactive element stays
  // dead — which is exactly what it did to the Playwright suite, since
  // playwright.config.ts serves the app with `next dev` and sets no PostHog vars.
  //
  // It also contradicts how every other optional integration behaves: Resend,
  // Twilio, Stripe and the ad slot all treat "unset" as "feature off", and
  // docs/runbooks/production-setup.md documents PostHog the same way.
  if (process.env.NODE_ENV === "development") {
    const missingVariable = key
      ? "NEXT_PUBLIC_POSTHOG_HOST"
      : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
    console.warn(
      `${missingVariable} is missing or un-configured — PostHog client analytics are OFF and events are silently dropped. This warning stops once ${missingVariable} is set.`,
    );
  }
} else {
  posthog.init(key, {
    api_host: host,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    before_send: beforeSend,
  });
}
