import { getLaunchPhase } from "@/lib/launch";
import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";
import type { SubscribeSource } from "@/domain/subscribers/sources";
import { CtaLink } from "./cta-link";
import { Section } from "./section";
import { SignupForm } from "./signup-form";

/** The end-of-page call to action, following the same launch phase as the home hero. */
export function ClosingCta({ page, source }: { page: string; source: SubscribeSource }) {
  const phase = getLaunchPhase();
  return (
    <Section className="pb-20">
      <div className="card flex flex-col gap-4 p-8">
        {phase === "list" ? (
          <>
            <h2 className="text-2xl font-semibold">Leagues open in December</h2>
            <p className="text-ink-soft">Get the weekly playoff race in your inbox, and a heads-up the day you can start a league.</p>
            <SignupForm source={source} />
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">Start your league</h2>
            <p className="text-ink-soft">
              Drafts open {formatCalendarDay(SEASON_CALENDAR.fieldSet)} and must finish before Wild Card kickoff on{" "}
              {formatCalendarDay(SEASON_CALENDAR.wildCardStart)}.
            </p>
            <div>
              <CtaLink href="/leagues/new" cta="start_league" page={page} phase={phase}>
                Start your league
              </CtaLink>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
