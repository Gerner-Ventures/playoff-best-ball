import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { SeedDemoResult } from "../../src/domain/demo/seed-demo";

export const TEST_DSN = "postgresql://pbb:pbb@localhost:5433/pbb_test";

/** Where seed.setup.ts hands the seeded world's ids to the specs. */
export const DEMO_HANDOFF = path.join(process.cwd(), "test-results", "demo-seed.json");
const HANDOFF = DEMO_HANDOFF;

/**
 * The demo world global setup created.
 *
 * Treat it as READ-ONLY. Every demo spec shares this one seeded world, so a spec
 * that drafts, picks or edits settings on these leagues would make the others
 * flaky. Specs that need to mutate build their own league with a `uniqueEmail`
 * account instead.
 */
export function readDemoSeed(): SeedDemoResult {
  if (!existsSync(HANDOFF)) {
    throw new Error(
      `No demo seed at ${HANDOFF}. e2e/global-setup.ts writes it; it is skipped when no season is captured under data/seasons/.`,
    );
  }
  return JSON.parse(readFileSync(HANDOFF, "utf8")) as SeedDemoResult;
}

export function demoLeague(seed: SeedDemoResult, tier: "PREMIUM" | "FREE") {
  const league = seed.leagues.find((l) => l.tier === tier);
  if (!league) throw new Error(`demo seed has no ${tier} league`);
  return league;
}
