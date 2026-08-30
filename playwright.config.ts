import { defineConfig } from "@playwright/test";

const TEST_DSN = "postgresql://pbb:pbb@localhost:5433/pbb_test";
const APP_URL = "http://localhost:3100";
const AUTH_SECRET = "e2e-test-secret-0123456789abcdef0123456789abcdef";

// Set here, not in a test file: the config is loaded before any test module in
// every worker, and tests/helpers/db.ts builds its Prisma client at module scope.
// An assignment inside seed.setup.ts would run too late, after that import.
process.env.DATABASE_URL ||= TEST_DSN;
process.env.BETTER_AUTH_URL ||= APP_URL;
process.env.BETTER_AUTH_SECRET ||= AUTH_SECRET;
process.env.DEMO_MODE ||= "1";

export default defineConfig({
  testDir: "e2e",
  // The setup project and the demo specs import domain code that uses the "@/"
  // alias. Playwright looks up a tsconfig per imported file and does not find the
  // root one on its own, so point it there. (This is also why seeding lives in a
  // setup project rather than `globalSetup`: globalSetup is loaded while the
  // config is loading, where this option has no effect.)
  tsconfig: "./tsconfig.json",
  use: { baseURL: APP_URL },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    { name: "e2e", testMatch: /.*\.spec\.ts/, dependencies: ["setup"] },
  ],
  webServer: {
    command: "rm -rf .next && npm run dev -- --port 3100",
    url: APP_URL,
    env: {
      E2E_TEST_MODE: "1",
      DATABASE_URL: TEST_DSN,
      BETTER_AUTH_SECRET: AUTH_SECRET,
      BETTER_AUTH_URL: APP_URL,
      // Lets the server serve the demo world the setup project seeds. The gate
      // still requires the allowlisted host above and the database sentinel.
      DEMO_MODE: "1",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
