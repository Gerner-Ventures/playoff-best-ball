/**
 * Puts the app into any phase of the product, with real captured playoff data.
 *
 *   npm run demo:seed -- --phase=live --week=2 --source=historical:2024
 *   npm run demo:seed -- --phase=draft
 *   npm run demo:seed -- --phase=pre-draft --source=synthetic
 *
 * Run against a dev or demo database only. It deletes and rebuilds its own corner
 * (the two pinned leagues, the @demo.example.com accounts, and the season's game
 * and stat rows) and marks the database as a demo database.
 *
 * Demo mode has to be on in this process, because Better Auth hashes passwords
 * internally — there is no way to write a sign-in-able account without asking it
 * to. That coupling is deliberate: the seeder can only mint accounts where
 * password auth is legitimately allowed. The gate still applies in full, so
 * pointing this at a production host or a live Stripe key throws on import.
 */
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  // Set before importing anything that reaches src/lib/demo-mode.ts, which
  // resolves at module scope. The host allowlist and the live-Stripe-key check
  // still run, so this cannot force demo mode on somewhere it does not belong.
  process.env.DEMO_MODE ??= "1";

  const [{ seedDemo }, { resolveSeasonSource, sourceIdFromInput }, { CURRENT_SEASON }, { auth }] =
    await Promise.all([
      import("../src/domain/demo/seed-demo"),
      import("../src/domain/stats/sources/resolve"),
      import("../src/domain/season"),
      import("../src/lib/auth"),
    ]);

  const phase = (arg("phase") ?? "live") as "pre-draft" | "draft" | "live";
  if (!["pre-draft", "draft", "live"].includes(phase)) {
    throw new Error(`--phase must be pre-draft, draft or live (got ${phase})`);
  }
  const week = arg("week") ? Number(arg("week")) : undefined;
  const sourceId = sourceIdFromInput(arg("source"));

  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("pg pool idle client error", err));
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const source = await resolveSeasonSource(db, sourceId, CURRENT_SEASON);
  console.log(`Seeding demo: phase=${phase}${week ? ` week=${week}` : ""} source=${sourceId}`);

  const result = await seedDemo(db, {
    phase,
    week,
    source,
    season: CURRENT_SEASON,
    createAccount: async ({ name, email, password }) => {
      const signed = await auth.api.signUpEmail({ body: { name, email, password } });
      return { id: signed.user.id };
    },
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  console.log("\nDemo ready.\n");
  console.log(`  Sign in at ${base}/sign-in`);
  console.log(`    email:    ${result.personaEmail}`);
  console.log(`    password: ${result.password}\n`);
  for (const league of result.leagues) {
    console.log(`  ${league.tier.padEnd(7)} ${league.name} (${league.entryCount} teams)`);
    console.log(`          ${base}/leagues/${league.id}`);
    console.log(`          join: ${base}/join/${league.inviteCode}`);
  }
  if (result.weeksFinal.length > 0) {
    console.log(`\n  played: weeks ${result.weeksFinal.join(", ")}`);
    console.log(`  upcoming: weeks ${result.weeksScheduled.join(", ")}`);
  }
  if (phase === "draft") console.log(`\n  You are on the clock in ${result.leagues[0].name}.`);

  await db.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
