import { test, expect } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers/auth";
import { testDb } from "../tests/helpers/db";

test("new accounts get the weekly digest by default and can turn it off", async ({ page }) => {
  // Mixed case on purpose: the hook must normalize it (better-auth may also lowercase it first; either way one row).
  const email = uniqueEmail("DiGeSt");
  await signUp(page, "Digest", email);

  // Proves the create-user hook itself ran — not just that the settings page repairs
  // a missing row on load, which would mask a dead hook.
  const subscriber = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  expect(subscriber).toMatchObject({ status: "ACTIVE", source: "account" });

  await page.goto("/settings/notifications");

  const toggle = page.getByLabel(/weekly playoff-race digest/i);
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  // The toggle is disabled while the PATCH is in flight; wait for the save before reloading.
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/weekly playoff-race digest/i)).not.toBeChecked();
});
