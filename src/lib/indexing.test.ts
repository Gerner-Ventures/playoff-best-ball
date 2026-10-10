import { describe, it, expect } from "vitest";
import { isIndexable, PUBLIC_ROUTES, robotsRules, sitemapEntries } from "./indexing";

describe("indexing policy", () => {
  it("indexes only the real production deployment", () => {
    expect(isIndexable({ VERCEL_ENV: "production", demoMode: false })).toBe(true);
    expect(isIndexable({ VERCEL_ENV: "production", demoMode: true })).toBe(false); // the demo project
    expect(isIndexable({ VERCEL_ENV: "preview", demoMode: false })).toBe(false);
    expect(isIndexable({ demoMode: false })).toBe(false); // local
  });

  it("production robots allow marketing, block the app, keep /join crawlable for link previews, and point at the sitemap", () => {
    const robots = robotsRules({ VERCEL_ENV: "production", demoMode: false });
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/dashboard", "/leagues/", "/admin", "/settings/", "/mock-draft"]));
    expect(rule.disallow).not.toContain("/join/");
    expect(robots.sitemap).toBe("https://playoffbestball.com/sitemap.xml");
  });

  it("everything else blocks all crawling", () => {
    for (const env of [{ VERCEL_ENV: "preview", demoMode: false }, { VERCEL_ENV: "production", demoMode: true }, { demoMode: false }]) {
      const robots = robotsRules(env);
      const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
      expect(rule.disallow).toBe("/");
      expect(robots.sitemap).toBeUndefined();
    }
  });

  it("the sitemap lists exactly the public marketing routes at the canonical origin", () => {
    expect(sitemapEntries().map((e) => e.url)).toEqual(PUBLIC_ROUTES.map((r) => `https://playoffbestball.com${r === "/" ? "" : r}`));
  });
});
