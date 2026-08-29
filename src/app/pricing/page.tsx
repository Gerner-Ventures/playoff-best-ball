import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";

export const metadata: Metadata = {
  title: "Pricing — Playoff Best Ball",
  description:
    "Play free with standard scoring, or upgrade a league to Premium for custom scoring, more teams, multiple entries and projections.",
};

/**
 * Every line here is enforced somewhere in the domain layer — the caps come from
 * the same constants the rules use, so the page cannot drift from the product.
 * Do not add a benefit that isn't gated in code.
 */
const FREE = [
  `Up to ${FREE_TIER_MAX_ENTRIES} teams per league`,
  "Standard, half PPR and full PPR scoring",
  "Async slow-snake draft with pick clocks",
  "Email, SMS and push notifications",
  "Best ball scoring all the way to the Super Bowl",
];

const PREMIUM = [
  `Up to ${PREMIUM_MAX_ENTRIES} teams per league`,
  "Custom scoring — set the value of every stat",
  "Multiple entries per person",
  "Next-week projections from recent scoring and Vegas win probability",
  "No ads",
];

function Check({ tone }: { tone: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 h-5 w-5 shrink-0" fill="none">
      <path d="M4 12.5 L9.5 18 L20 6" stroke={tone} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function PricingPage() {
  const user = await getSessionUser();
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);

  return (
    <>
      {user ? (
        <AppNav userName={user.name} />
      ) : (
        <nav className="flex items-center justify-between border-b border-chalk-line px-6 py-3">
          <Link href="/" className="chalk font-chalk text-2xl font-bold text-chalk">
            Playoff Best Ball
          </Link>
          <Link href="/sign-in" className="text-sm text-chalk-dim hover:text-chalk hover:underline">
            Sign in
          </Link>
        </nav>
      )}

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="chalk chalk-h1 text-5xl sm:text-6xl">Pricing</h1>
        <p className="mt-3 max-w-2xl text-lg text-chalk-soft text-pretty">
          Playing is free. Premium is bought per league, per season, by whoever runs it — once
          it&apos;s on, everyone in that league gets it.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="chalk-card flex flex-col gap-5 p-7">
            <div>
              <h2 className="chalk chalk-h2 text-4xl text-chalk">Free</h2>
              <p className="mt-1 text-sm text-chalk-dim">Everything you need to run a league.</p>
            </div>
            <p className="tabular text-4xl font-semibold text-chalk">$0</p>
            <ul className="flex flex-col gap-3">
              {FREE.map((item) => (
                <li key={item} className="flex gap-3 text-chalk-soft">
                  <Check tone="var(--chalk-dim)" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link href={user ? "/leagues/new" : "/sign-in"} className="chalk-btn mt-auto self-start">
              {user ? "Create a league" : "Get started"}
            </Link>
          </section>

          <section className="chalk-card chalk-card-accent chalk-card-yellow flex flex-col gap-5 p-7">
            <div className="flex items-center gap-3">
              <h2 className="chalk chalk-h2 text-4xl text-chalk-yellow">Premium</h2>
              <span className="chalk-badge">PER LEAGUE</span>
            </div>
            <p className="-mt-3 text-sm text-chalk-dim">Everything in Free, plus:</p>
            <p className="text-chalk">
              <span className="tabular text-4xl font-semibold">{price}</span>
              <span className="ml-2 text-chalk-dim">per season</span>
            </p>
            <ul className="flex flex-col gap-3">
              {PREMIUM.map((item) => (
                <li key={item} className="flex gap-3 text-chalk-soft">
                  <Check tone="var(--chalk-yellow)" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto text-sm text-chalk-dim">
              Upgrade from your league page — the commissioner pays once and the whole league is in.
            </p>
          </section>
        </div>

        <section className="mt-12 flex flex-col gap-5">
          <h2 className="chalk chalk-h2 text-3xl text-chalk-mint">Questions</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold text-chalk">Is it per league or per person?</h3>
              <p className="mt-1 text-chalk-soft">
                Per league. One payment covers that league for the season, for every member.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-chalk">Does it renew?</h3>
              <p className="mt-1 text-chalk-soft">
                No. It&apos;s a one-time charge for the season — there&apos;s no subscription to cancel.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-chalk">Can I upgrade mid-season?</h3>
              <p className="mt-1 text-chalk-soft">
                Yes, and Premium switches on straight away. Scoring changes apply to weeks already
                played, since points are worked out when standings are read — so check with your
                league before rewriting the rules in January.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-chalk">What happens to a free league?</h3>
              <p className="mt-1 text-chalk-soft">
                Nothing changes. It keeps running with standard scoring and up to{" "}
                {FREE_TIER_MAX_ENTRIES} teams for as long as you want.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
