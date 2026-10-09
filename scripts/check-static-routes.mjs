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

const manifest = JSON.parse(readFileSync(new URL("../.next/prerender-manifest.json", import.meta.url), "utf8"));
const missing = STATIC_ROUTES.filter((route) => !(route in manifest.routes));

if (missing.length) {
  console.error(`Not prerendered: ${missing.join(", ")}`);
  console.error("Something in their render path reads cookies, headers or the session.");
  process.exit(1);
}
console.log(`All ${STATIC_ROUTES.length} marketing routes prerendered.`);
