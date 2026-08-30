import { test as setup } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedPlayers, PLAYERS_FIXTURE } from "../prisma/seed-players";
import { resetDb } from "../tests/helpers/db";
import { seedDemo } from "../src/domain/demo/seed-demo";
import { createHistoricalSource } from "../src/domain/stats/sources/historical-source";
import { listCapturedSeasons, loadSeasonSnapshot } from "../src/lib/demo/season-snapshot";
import { CURRENT_SEASON } from "../src/domain/season";
import { DEMO_HANDOFF, TEST_DSN } from "./helpers/demo";

/**
 * Prepares the database for every spec. Runs as a Playwright *project dependency*
 * rather than `globalSetup`, because globalSetup is loaded while the config itself
 * is being loaded and so is not covered by the `tsconfig` option — it cannot
 * resolve the "@/" alias that the domain code it needs uses. Setup projects are
 * ordinary test files and resolve it fine.
 *
 * The reset is safe here and nowhere else: this runs to completion before any
 * worker starts a spec, whereas a reset between specs would wipe a
 * concurrently-running one. Before this existed, e2e rows accumulated across every
 * run forever and specs worked around it with timestamped emails.
 */
setup("seed the database", async () => {
  setup.setTimeout(180_000);

  // This process is separate from the web server and needs its own configuration.
  // localhost:3100 is on the allowlist in src/lib/demo-mode.ts; without a matching
  // BETTER_AUTH_URL the demo gate refuses to boot, which is the intended behavior.
  process.env.DATABASE_URL ??= TEST_DSN;
  process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
  process.env.BETTER_AUTH_SECRET ??= "e2e-test-secret-0123456789abcdef0123456789abcdef";
  process.env.DEMO_MODE ??= "1";

  const pool = new Pool({ connectionString: TEST_DSN });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  await resetDb();

  // Bootstrap pool for specs that build their own league through the UI. Small on
  // purpose — those specs only ever draft 2-team leagues.
  await seedPlayers(db, PLAYERS_FIXTURE);

  const seasons = listCapturedSeasons();
  if (seasons.length > 0) {
    // Imported lazily: src/lib/auth.ts reads demo-mode at module scope, so the env
    // above has to be set first.
    const { auth } = await import("../src/lib/auth");
    const result = await seedDemo(db, {
      phase: "live",
      week: 2,
      source: createHistoricalSource(loadSeasonSnapshot(seasons[0])),
      season: CURRENT_SEASON,
      createAccount: async ({ name, email, password }) => {
        const signed = await auth.api.signUpEmail({ body: { name, email, password } });
        return { id: signed.user.id };
      },
    });
    mkdirSync(path.dirname(DEMO_HANDOFF), { recursive: true });
    writeFileSync(DEMO_HANDOFF, JSON.stringify(result, null, 2));
  }

  await db.$disconnect();
  await pool.end();
});
