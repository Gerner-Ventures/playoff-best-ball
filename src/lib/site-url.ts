import type { SubscriberUrls } from "@/domain/subscribers/sender";

/** The production origin: canonical URLs, sitemap and metadataBase. Previews never use it. */
export const CANONICAL_ORIGIN = "https://playoffbestball.com";

/** This deployment's origin, for links inside emails (works on previews and locally). */
export function appOrigin(
  // `ProcessEnv` declares no property named `BETTER_AUTH_URL`, so it has nothing in
  // common with this all-optional type by TS's weak-type check (same issue as
  // `DemoModeEnv` in demo-mode.ts). The cast is the read; the field is an optional
  // string either way.
  env: { BETTER_AUTH_URL?: string } = process.env as { BETTER_AUTH_URL?: string },
): string {
  return (env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function subscriberUrls(origin: string = appOrigin()): SubscriberUrls {
  const q = (token: string) => `token=${encodeURIComponent(token)}`;
  return {
    confirm: (token) => `${origin}/subscribe/confirm?${q(token)}`,
    unsubscribePage: (token) => `${origin}/unsubscribe?${q(token)}`,
    oneClickUnsubscribe: (token) => `${origin}/api/unsubscribe?${q(token)}`,
  };
}
