import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: { default: "Playoff Best Ball", template: "%s · Playoff Best Ball" },
  twitter: { card: "summary_large_image" },
};

// Every marketing page shows a launch-phase CTA (home hero, ClosingCta), so all of
// them re-render hourly. Otherwise the phase would freeze at build time and the CTA
// would never flip at SIGNUPS_OPEN_AT without a deploy (spec §4.2).
export const revalidate = 3600;

/**
 * Static by construction: nothing in this group may read cookies, headers or the
 * session (scripts/check-static-routes.mjs enforces it in CI).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light flex flex-1 flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
