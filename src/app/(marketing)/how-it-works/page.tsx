import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_ROSTER_SLOTS, FREE_TIER_MAX_ENTRIES, pickClockHoursSchema } from "@/domain/league-settings";
import { FLEX_ELIGIBLE } from "@/domain/draft/slot-assignment";
import { PREMIUM_MAX_ENTRIES } from "@/domain/leagues/upgrade-league";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import { Section } from "@/components/marketing/section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How NFL playoff best ball works: a slow snake draft before Wild Card weekend, nine players who score every round their team is alive, and no lineups to set.",
  alternates: { canonical: "/how-it-works" },
};

// Derived from the engine, so the copy can't drift from the rules.
const ROSTER = DEFAULT_ROSTER_SLOTS.map((s) => (s.slot === "FLEX" ? `FLEX (${FLEX_ELIGIBLE.join("/")})` : s.slot)).join(", ");
const CLOCKS = pickClockHoursSchema.options.map((o) => o.value);
const CLOCK_TEXT = `${CLOCKS.slice(0, -1).join(", ")} or ${CLOCKS.at(-1)} hours`;

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Set up the league",
    body: (
      <>
        A commissioner creates the league, chooses the scoring and the pick clock, and shares one invite link. Up to{" "}
        {FREE_TIER_MAX_ENTRIES} teams play free; Premium leagues hold up to {PREMIUM_MAX_ENTRIES} and allow more than one
        team per person.
      </>
    ),
  },
  {
    title: "The draft",
    body: (
      <>
        A snake draft, nine rounds, and every NFL player can be drafted once per league. Each pick has a clock of{" "}
        {CLOCK_TEXT}, set by the commissioner, and it can pause overnight from 1 to 8 a.m. Eastern. You&apos;re
        notified by email when you&apos;re on the clock, and by text or push if you turn those on. If time runs out,
        autodraft takes your top queued player that fits, or the best available. Drafts run between{" "}
        {formatCalendarDay(SEASON_CALENDAR.fieldSet)}, when the playoff field is set, and Wild Card kickoff on{" "}
        {formatCalendarDay(SEASON_CALENDAR.wildCardStart)}.
      </>
    ),
  },
  {
    title: "Your roster",
    body: (
      <>
        Nine slots: <span className="font-mono text-ink">{ROSTER}</span>. Every pick fills one, so plan your positions;
        there&apos;s no bench to hide a mistake.
      </>
    ),
  },
  {
    title: "Scoring",
    body: (
      <>
        Points come from real NFL box scores, using standard, half-PPR or full-PPR scoring (Premium leagues can set
        every value). All nine of your players score every round their team plays.{" "}
        <Link href="/scoring" className="font-semibold text-brand underline-offset-4 hover:underline">
          See the scoring tables
        </Link>
        .
      </>
    ),
  },
  {
    title: "Eliminations and byes",
    body: "Lose and you're out: a player stops scoring when his team is eliminated. The top seed in each conference skips Wild Card weekend, so its players can play three games at most instead of four. Balancing bye teams against teams that have to win four times is the strategy.",
  },
  {
    title: "Injuries",
    body: "Commissioners can turn on substitutions (off by default). An injured player's points up to the injury count, plus his substitute's points afterward.",
  },
  {
    title: "Following along",
    body: "Scores update live during games, the leaderboard moves with every touchdown, and everyone gets a preview before each round and a recap after it.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section className="pt-16">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How playoff best ball works</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Draft nine players before Wild Card weekend. They score every round their team survives. Most points after the
          Super Bowl wins.
        </p>
      </Section>
      <Section>
        <div className="flex max-w-3xl flex-col gap-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-2xl font-semibold">{s.title}</h2>
              <p className="mt-3 text-lg text-ink-soft">{s.body}</p>
            </section>
          ))}
        </div>
      </Section>
      <ClosingCta page="how_it_works" source="how_it_works" />
    </>
  );
}
