import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_ROSTER_SLOTS, FREE_TIER_MAX_ENTRIES } from "@/domain/league-settings";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import { Section } from "@/components/marketing/section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "Commissioners",
  description: `Run an NFL playoff best ball league in minutes: one invite link, a slow draft that runs itself, dues tracking, and free for up to ${FREE_TIER_MAX_ENTRIES} teams.`,
  alternates: { canonical: "/commissioners" },
};

export default function CommissionersPage() {
  const fieldSet = formatCalendarDay(SEASON_CALENDAR.fieldSet);
  const wildCard = formatCalendarDay(SEASON_CALENDAR.wildCardStart);
  const price = formatPriceUsd(PREMIUM_PRICE_CENTS);
  const freeTeams = FREE_TIER_MAX_ENTRIES;
  const freePicks = FREE_TIER_MAX_ENTRIES * DEFAULT_ROSTER_SLOTS.length;

  const items: { title: string; body: React.ReactNode }[] = [
    {
      title: "Set up in a couple of minutes",
      body: "Name the league, pick a scoring preset and a pick clock, and decide whether the clock pauses overnight. Add an entry fee and your Venmo handle if your group plays for money.",
    },
    {
      title: "One link brings everyone in",
      body: "Share the invite link in your group chat. Members sign in without a password, and joining is always free.",
    },
    {
      title: "Plan the draft window",
      body: `The playoff field is set on ${fieldSet}, and the draft has to finish before Wild Card kickoff on ${wildCard}. Schedule the start time, and pick a clock that fits: with ${freeTeams} teams there are ${freePicks} picks to make, so shorter clocks finish sooner.`,
    },
    {
      title: "The draft runs itself",
      body: "Everyone is notified when they're on the clock, and autodraft covers anyone who misses a turn. You never have to chase people down in the group chat.",
    },
    {
      title: "Track who's paid",
      body: "Mark each team paid on the league page and show members where to send the money. The money itself never touches Playoff Best Ball.",
    },
    {
      title: "Free, or Premium for bigger leagues",
      body: (
        <>
          Free leagues hold up to {FREE_TIER_MAX_ENTRIES} teams with preset scoring, one free league per commissioner each season.
          Premium is {price} per league, per season: up to {PREMIUM_MAX_ENTRIES} teams, custom scoring, more than one team
          per person, and projections.{" "}
          <Link href="/pricing" className="font-semibold text-brand underline-offset-4 hover:underline">
            Pricing
          </Link>
        </>
      ),
    },
  ];

  return (
    <>
      <Section className="pt-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">For commissioners</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Run the league, skip the spreadsheet</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          No more drafting over text across three days. Set the league up once and the app handles the draft, the scoring and
          the standings.
        </p>
      </Section>
      <Section>
        <ul className="grid gap-6 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.title} className="card p-6">
              <h2 className="text-xl font-semibold">{i.title}</h2>
              <p className="mt-2 text-ink-soft">{i.body}</p>
            </li>
          ))}
        </ul>
      </Section>
      <ClosingCta page="commissioners" source="commissioners" />
    </>
  );
}
