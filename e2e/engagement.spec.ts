import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers/auth";

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues/new");
  await page.getByPlaceholder("The Gerner Invitational").fill(name);
  await page.getByPlaceholder("Team Nick").fill("Commish Team");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("commissioner enables injury substitutions and it persists", async ({ page }) => {
  const stamp = Date.now();
  await signUp(page, "Commish", `eng-${stamp}@example.com`);
  await createLeague(page, "Engagement League");

  await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "League settings" })).toBeVisible();

  const subsCheckbox = page.getByLabel(/allow injury substitutions/i);
  await expect(subsCheckbox).not.toBeChecked(); // off by default
  await subsCheckbox.check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(/allow injury substitutions/i)).toBeChecked();
});
