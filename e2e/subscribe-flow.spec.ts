import { test, expect } from "@playwright/test";
import { testDb } from "../tests/helpers/db";
import { requestSubscription } from "../src/domain/subscribers/subscribe";
import type { MarketingEmail } from "../src/domain/subscribers/sender";
import { subscriberUrls } from "../src/lib/site-url";
import { uniqueEmail, signUp } from "./helpers/auth";

/** A pending subscription created through the real domain code, with its emailed links captured. */
async function pendingSubscription(baseURL: string) {
  const email = uniqueEmail("flow");
  const sent: MarketingEmail[] = [];
  await requestSubscription(testDb, { send: async (m) => void sent.push(m) }, subscriberUrls(baseURL), {
    email,
    source: "footer",
    now: new Date(),
  });
  const confirmUrl = sent[0].text.match(/Confirm: (\S+)/)![1];
  const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email } });
  return { email, confirmUrl, row };
}

test("confirm, unsubscribe and resubscribe through the real pages", async ({ page, baseURL }) => {
  const { confirmUrl, row } = await pendingSubscription(baseURL!);

  // The scanner guarantee: merely GETting the emailed link (no click) must not confirm.
  await page.goto(confirmUrl);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");

  await page.getByRole("button", { name: /confirm my email/i }).click();
  await expect(page).toHaveURL(/\/subscribe\/confirmed$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/you're on the list/i);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");

  // A re-click of the same email link is harmless.
  await page.goto(confirmUrl);
  await page.getByRole("button", { name: /confirm my email/i }).click();
  await expect(page).toHaveURL(/\/subscribe\/confirmed$/);

  // Same scanner guarantee on the unsubscribe link: the GET that lands on this page must not unsubscribe.
  await page.goto(`/unsubscribe?token=${row.unsubscribeToken}`);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");

  await page.getByRole("button", { name: /^unsubscribe$/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/you're unsubscribed/i);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UNSUBSCRIBED");

  await page.getByRole("button", { name: /resubscribe/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/you're back on the list/i);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");
});

test("a truncated confirm link shows a friendly page with a way to sign up again", async ({ page }) => {
  await page.goto("/subscribe/confirm?token=abc123");
  await page.getByRole("button", { name: /confirm my email/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/isn't valid/i);
  await expect(page.getByRole("main").getByLabel(/email address/i)).toBeVisible();
});

test("one-click unsubscribe works without a page", async ({ page, baseURL }) => {
  const { row } = await pendingSubscription(baseURL!);
  const res = await page.request.post(`/api/unsubscribe?token=${row.unsubscribeToken}`, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(res.status()).toBe(200);
  expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UNSUBSCRIBED");
});

test("a signed-in visitor using the header's Sign in lands on the dashboard", async ({ page }) => {
  await signUp(page, "Header", uniqueEmail("header"));
  await page.goto("/faq");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
