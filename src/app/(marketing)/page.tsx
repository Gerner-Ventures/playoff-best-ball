import Link from "next/link";
import type { Metadata } from "next";
import { getLaunchPhase } from "@/lib/launch";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { SignupForm } from "@/components/marketing/signup-form";
import { CtaLink } from "@/components/marketing/cta-link";
import { KeyDates } from "@/components/marketing/key-dates";
import { Steps } from "@/components/marketing/steps";
import { Section } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq-list";
import { faqItems } from "@/components/marketing/faq-content";

// No `revalidate` here: the (marketing) layout sets it hourly for every page, so the
// hero CTA flips at SIGNUPS_OPEN_AT without a redeploy (spec §4.2).

export const metadata: Metadata = {
  title: { absolute: "Playoff Best Ball — draft once, watch all playoffs" },
  description:
    "Run an NFL playoff best ball league with your friends: a slow draft over a few days, then nothing to manage through the Super Bowl. Free for up to 10 teams.",
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Start a league, send one link",
    body: "Create a league in a couple of minutes and drop the invite link in your group chat. Joining is always free.",
  },
  {
    title: "Draft on your own time",
    body: "A slow snake draft: each pick has a 2- to 24-hour clock, and you're notified when you're up. The clock can pause overnight, and autodraft covers a missed turn.",
  },
  {
    title: "Watch it score itself",
    body: "No lineups, no waivers. All nine of your players score every round their team is alive. Most total points after the Super Bowl wins.",
  },
];

const WHY = [
  {
    title: "Every round counts",
    body: "Points from Wild Card weekend through the Super Bowl all add up, so a player whose team goes deep beats one big game.",
  },
  { title: "Nothing to manage", body: "Draft well, then watch. There's no start/sit decision and no waiver wire." },
  {
    title: "Byes and eliminations are the game",
    body: "Top seeds skip Wild Card weekend and every loss ends a season. Picking who plays the most games is the whole strategy.",
  },
];

export default function HomePage() {
  const phase = getLaunchPhase();
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);

  return (
    <>
      <Section className="pt-16 sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">NFL playoff best ball</p>
        <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
          Draft once. Watch all playoffs.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-soft text-pretty sm:text-xl">
          Run a playoff best ball league with your friends. Everyone drafts on their own time over a few days,
          then there&apos;s nothing to manage: your players score every round their team survives, from Wild
          Card weekend to the Super Bowl.
        </p>
        <div className="mt-8 max-w-2xl">
          {phase === "list" ? (
            <>
              <SignupForm source="home_hero" />
              <p className="mt-3 text-sm text-ink-muted">
                Free. One email a week through the regular season, plus a heads-up when leagues open.
              </p>
            </>
          ) : (
            <>
              <CtaLink href="/leagues/new" cta="start_league" page="home" phase={phase}>
                Start your league
              </CtaLink>
              <p className="mt-3 text-sm text-ink-muted">
                Drafts open {formatCalendarDay(SEASON_CALENDAR.fieldSet)}, the day the playoff field is set.
                Free for up to {FREE_TIER_MAX_ENTRIES} teams.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section eyebrow="Key dates" title="Six days to draft, five weeks to watch">
        <KeyDates />
      </Section>

      <Section eyebrow="How it works" title="Three steps, then the playoffs do the work">
        <Steps steps={STEPS} />
        <p className="mt-6">
          <Link href="/how-it-works" className="font-semibold text-brand underline-offset-4 hover:underline">
            The full rules
          </Link>
        </p>
      </Section>

      <Section eyebrow="Why playoff best ball" title="Built for the six best weeks of the season">
        <ul className="grid gap-6 md:grid-cols-3">
          {WHY.map((w) => (
            <li key={w.title}>
              <h3 className="text-lg font-semibold">{w.title}</h3>
              <p className="mt-2 text-ink-soft">{w.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Pricing" title="Free to play">
        <p className="max-w-2xl text-lg text-ink-soft">
          Free for up to {FREE_TIER_MAX_ENTRIES} teams with standard, half-PPR or full-PPR scoring. Premium is{" "}
          {price} per league, per season, for custom scoring, up to {PREMIUM_MAX_ENTRIES} teams and projections.
        </p>
        <p className="mt-6">
          <Link href="/pricing" className="btn">
            See pricing
          </Link>
        </p>
      </Section>

      <Section eyebrow="Questions" title="The short version">
        {/* "when" is excluded here: its answer quotes the same calendar dates as
            KeyDates above, which would make them ambiguous to a page-wide text query. */}
        <FaqList items={faqItems().filter((f) => ["what", "eliminated", "online"].includes(f.id))} />
        <p className="mt-6">
          <Link href="/faq" className="font-semibold text-brand underline-offset-4 hover:underline">
            All questions
          </Link>
        </p>
      </Section>
    </>
  );
}
