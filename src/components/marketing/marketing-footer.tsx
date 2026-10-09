import Link from "next/link";
import { SignupForm } from "./signup-form";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/scoring", label: "Scoring" },
  { href: "/commissioners", label: "Commissioners" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/sign-in?callbackURL=/dashboard", label: "Sign in" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">The playoff race, once a week</h2>
          <p className="text-ink-soft">
            Through the regular season: whose playoff stock is rising, who clinched, who&apos;s out. Plus a
            heads-up when it&apos;s time to set up your league.
          </p>
          <SignupForm source="footer" compact />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-6 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-sm text-ink-muted sm:px-6">
        © {new Date().getFullYear()} Playoff Best Ball. Not affiliated with the NFL.
      </p>
    </footer>
  );
}
