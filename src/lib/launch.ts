/**
 * When the homepage stops asking for an email and starts asking for a league
 * (spec §4.2). It is a reviewed code change, like pricing.ts. Mid-December is the
 * working assumption (spec §13); Nick sets the final date. The home page revalidates
 * hourly, so the switch happens within an hour without a redeploy.
 */
export const SIGNUPS_OPEN_AT = new Date("2026-12-14T14:00:00Z"); // Mon Dec 14, 9:00 ET

export type LaunchPhase = "list" | "signups_open";

export function getLaunchPhase(now: Date = new Date()): LaunchPhase {
  return now.getTime() >= SIGNUPS_OPEN_AT.getTime() ? "signups_open" : "list";
}
