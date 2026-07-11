import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "rm -rf .next && npm run dev -- --port 3100",
    url: "http://localhost:3100",
    env: {
      E2E_TEST_MODE: "1",
      DATABASE_URL: "postgresql://pbb:pbb@localhost:5433/pbb_test",
      BETTER_AUTH_SECRET: "e2e-test-secret-0123456789abcdef0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3100",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
