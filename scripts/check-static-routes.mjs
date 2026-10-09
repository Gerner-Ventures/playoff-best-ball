#!/usr/bin/env node
/**
 * Fails when a marketing page stops prerendering. A session read creeping back into
 * the root layout (or any page in the group) silently turns these into per-request
 * renders. That's slower for every visitor, and nothing else would notice.
 *
 * Run after `next build`: node scripts/check-static-routes.mjs
 */
import { readFileSync } from "node:fs";

const STATIC_ROUTES = ["/", "/how-it-works", "/scoring", "/commissioners", "/pricing", "/faq", "/subscribe/confirmed"];
const EXPECTED_REVALIDATE_SECONDS = 3600;

const manifest = JSON.parse(readFileSync(new URL("../.next/prerender-manifest.json", import.meta.url), "utf8"));
const missing = STATIC_ROUTES.filter((route) => !(route in manifest.routes));

if (missing.length) {
  console.error(`Not prerendered: ${missing.join(", ")}`);
  console.error("Something in their render path reads cookies, headers or the session.");
  process.exit(1);
}

// Also catch a route that still prerenders but lost its hourly revalidate — that would
// serve the same stale shell forever instead of picking up SIGNUPS_OPEN_AT (spec §4.2).
const wrongRevalidate = STATIC_ROUTES.filter(
  (route) => manifest.routes[route].initialRevalidateSeconds !== EXPECTED_REVALIDATE_SECONDS,
);

if (wrongRevalidate.length) {
  console.error(
    `Not revalidating every ${EXPECTED_REVALIDATE_SECONDS}s: ${wrongRevalidate
      .map((route) => `${route} (${manifest.routes[route].initialRevalidateSeconds})`)
      .join(", ")}`,
  );
  console.error("Check the `revalidate` export on the (marketing) layout/pages.");
  process.exit(1);
}

console.log(`All ${STATIC_ROUTES.length} marketing routes prerendered and revalidate every ${EXPECTED_REVALIDATE_SECONDS}s.`);
