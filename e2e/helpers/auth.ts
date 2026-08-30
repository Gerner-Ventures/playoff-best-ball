import { expect, type Page } from "@playwright/test";

export const E2E_PASSWORD = "e2e-password-123";

/**
 * Creates an account and a session via the API.
 *
 * Password auth is normally off. It is mounted here because playwright.config.ts
 * sets E2E_TEST_MODE=1 against a dev-mode server; that branch of the gate needs no
 * database sentinel, because the e2e database is disposable (see
 * src/lib/demo-mode.ts). Cookies land on the page's context, so the page is signed
 * in afterwards.
 */
export async function signUp(page: Page, name: string, email: string): Promise<void> {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: E2E_PASSWORD },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

/** Signs in as an already-seeded account, e.g. one the demo seeder created. */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(res.ok(), `sign-in failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

/**
 * A unique email for a spec that builds its own world.
 *
 * Specs share one database and run across parallel workers, so an address has to
 * be unique per worker AND per run. The timestamp alone is not enough: two workers
 * can land on the same millisecond.
 */
export function uniqueEmail(prefix: string): string {
  const worker = process.env.TEST_PARALLEL_INDEX ?? process.env.TEST_WORKER_INDEX ?? "0";
  return `${prefix}-${worker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
