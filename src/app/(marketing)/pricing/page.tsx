import type { Metadata } from "next";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { Section } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq-list";
import { faqItems } from "@/components/marketing/faq-content";
import { CtaLink } from "@/components/marketing/cta-link";
import { getLaunchPhase } from "@/lib/launch";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Play free with standard, half-PPR or full-PPR scoring, or upgrade a league to Premium for custom scoring, more teams, multiple entries and projections.",
  alternates: { canonical: "/pricing" },
};

/**
 * Every line here is enforced somewhere in the domain layer. The caps come from the
 * same constants the rules use, so the page cannot drift from the product. Do not
 * add a benefit that isn't gated in code.
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

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 h-5 w-5 shrink-0 text-brand" fill="none">
      <path d="M4 12.5 L9.5 18 L20 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingPage() {
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);
  const phase = getLaunchPhase();
  return (
    <>
      <Section className="pt-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pricing</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Playing is free. Premium is bought per league, per season, by whoever runs it. Once it&apos;s on, everyone in that
          league gets it.
        </p>
      </Section>
      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="card flex flex-col gap-4 p-8">
            <h2 className="text-2xl font-semibold">Free</h2>
            <p className="text-ink-soft">Everything you need to run a league.</p>
            <p className="font-mono text-4xl font-semibold">$0</p>
            <ul className="flex flex-col gap-2">
              {FREE.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2">
              <CtaLink href="/leagues/new" cta="create_league" page="pricing" phase={phase} className="btn">
                Create a league
              </CtaLink>
            </div>
          </section>
          <section className="card flex flex-col gap-4 border-brand p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Premium</h2>
              <span className="badge text-brand">PER LEAGUE</span>
            </div>
            <p className="text-ink-soft">Everything in Free, plus:</p>
            <p>
              <span className="font-mono text-4xl font-semibold">{price}</span>{" "}
              <span className="text-ink-muted">per season</span>
            </p>
            <ul className="flex flex-col gap-2">
              {PREMIUM.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-2 text-sm text-ink-muted">
              Upgrade from your league page. The commissioner pays once and the whole league is in.
            </p>
          </section>
        </div>
      </Section>
      <Section title="Questions">
        <FaqList items={faqItems().filter((f) => f.category === "pricing")} />
      </Section>
    </>
  );
}
