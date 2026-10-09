import Link from "next/link";
import { Wordmark } from "./wordmark";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/commissioners", label: "Commissioners" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingHeader() {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link href="/" className="text-lg" aria-label="Playoff Best Ball home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hidden min-h-11 items-center rounded px-3 text-ink-soft hover:text-ink md:inline-flex">
              {n.label}
            </Link>
          ))}
          {/* callbackURL=/dashboard: a signed-in visitor clicking this lands in the app, not on a form. */}
          <Link href="/sign-in?callbackURL=/dashboard" className="btn">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
