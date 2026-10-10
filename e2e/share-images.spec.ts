import { test, expect } from "@playwright/test";

for (const path of ["/", "/how-it-works", "/scoring", "/commissioners", "/pricing", "/faq"]) {
  test(`${path} has a large share card that renders as a PNG`, async ({ page }) => {
    await page.goto(path);
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toBeTruthy();
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    // og:image is absolute against metadataBase, which under `next dev` resolves to this
    // server's own local origin, not production; fetch the same path from this server either way.
    const res = await page.request.get(new URL(og!).pathname + new URL(og!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
}
