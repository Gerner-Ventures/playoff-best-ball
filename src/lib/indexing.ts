import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "./site-url";

/** Marketing pages worth indexing. Piece 3 appends the rankings and race pages. */
export const PUBLIC_ROUTES = ["/", "/how-it-works", "/scoring", "/commissioners", "/pricing", "/faq"] as const;

/**
 * Signed-in app areas. /join/ is deliberately absent: invite pages carry a noindex
 * meta tag instead, because link-preview bots that obey robots.txt (Twitterbot)
 * would otherwise never fetch the invite card, and Google can only honor noindex on
 * pages it may crawl (plan: spec clarification 2).
 */
const DISALLOW = ["/api/", "/dashboard", "/leagues/", "/admin", "/settings/", "/mock-draft", "/sign-in"];

export interface IndexingEnv {
  VERCEL_ENV?: string;
  demoMode: boolean;
}

/** Only the real production deployment is indexable. Previews, the demo project and local are not (spec §6). */
export function isIndexable(env: IndexingEnv): boolean {
  return env.VERCEL_ENV === "production" && !env.demoMode;
}

export function robotsRules(env: IndexingEnv): MetadataRoute.Robots {
  if (!isIndexable(env)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOW },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
  };
}

export function sitemapEntries(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({ url: `${CANONICAL_ORIGIN}${route === "/" ? "" : route}` }));
}
