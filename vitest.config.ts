import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    fileParallelism: false, // tests share one Postgres; run files serially
    environment: "node",
    exclude: ["node_modules/**", ".next/**"],
    // Vitest's defaults (5s test / 10s hook) are a poor fit here: 28 of these
    // files talk to Postgres, `beforeEach(resetDb)` issues 20 sequential deletes,
    // and helpers like createStandardPool insert ~130 rows one await at a time.
    //
    // Measured on a fast local machine, demo-seed-integration's "seeding twice"
    // case runs 1773ms against ~900ms for its neighbours — only 2.8x under the old
    // 5s ceiling. CI runners are several times slower, so it crossed: that test
    // failed on both #41 and #37 and passed on re-run each time.
    //
    // Raising the ceiling fixes the whole class rather than the one test that
    // happened to trip first. The pure-domain tests run in single-digit ms and
    // never approach this, so the only cost is that a genuine hang takes longer
    // to surface.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
