import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    fileParallelism: false, // tests share one Postgres; run files serially
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
