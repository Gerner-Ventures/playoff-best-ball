import { test, expect } from "@playwright/test";
import { testDb } from "../tests/helpers/db";
import { getLaunchPhase } from "../src/lib/launch";
import { uniqueEmail } from "./helpers/auth";

test("home renders the pitch, the key dates and a phase-appropriate call to action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/draft once\. watch all playoffs\./i);
  const keyDates = page.getByTestId("key-dates");
  await expect(keyDates.getByText("Sun, Jan 10")).toBeVisible();
  await expect(keyDates.getByText("Sat, Jan 16")).toBeVisible();
  if (getLaunchPhase() === "list") {
    await expect(page.getByRole("main").getByRole("button", { name: /get the weekly digest/i })).toBeVisible();
  } else {
    await expect(page.getByRole("main").getByRole("link", { name: /start your league/i })).toBeVisible();
  }
});

test("the footer signup confirms by email and stores a pending, lowercased address", async ({ page }) => {
  const email = uniqueEmail("Footer");
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByLabel(/email address/i).fill(`  ${email.toUpperCase()}  `);
  await footer.getByRole("button", { name: /get the weekly digest/i }).click();
  await expect(footer.getByText(/check your inbox/i)).toBeVisible();

  const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  expect(row.status).toBe("PENDING");
  expect(row.source).toBe("footer");
});

test("the header's Sign in link takes a signed-out visitor to sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fdashboard|\/sign-in\?callbackURL=\/dashboard/);
});
