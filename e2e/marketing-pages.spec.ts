import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/how-it-works", h1: /how playoff best ball works/i, title: /How it works · Playoff Best Ball/ },
  { path: "/commissioners", h1: /run the league, skip the spreadsheet/i, title: /Commissioners · Playoff Best Ball/ },
  { path: "/scoring", h1: /^scoring$/i, title: /Scoring · Playoff Best Ball/ },
];

for (const p of PAGES) {
  test(`${p.path} renders with its own title and canonical link`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://playoffbestball.com${p.path}`);
  });
}

test("how-it-works lists the real roster and pick clock options", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText("QB, RB, RB, WR, WR, TE, FLEX (RB/WR/TE), K, DST")).toBeVisible();
  await expect(page.getByText(/2, 4, 8 or 24 hours/)).toBeVisible();
});

test("scoring shows the preset values from the engine", async ({ page }) => {
  await page.goto("/scoring");
  const reception = page.getByRole("row", { name: /^Reception/ });
  await expect(reception).toContainText("+0.5");
  await expect(reception).toContainText("+1");
});
