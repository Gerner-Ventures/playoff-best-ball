import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { tryParseLeagueSettings } from "@/domain/league-settings";
import { getLeagueScores } from "@/lib/league-scores";
import { getLeagueProjections } from "@/lib/league-projections";
import { AppNav } from "@/components/app-nav";
import { InviteLinkButton } from "@/components/invite-link-button";
import { DraftCard } from "@/components/draft-card";
import { Leaderboard } from "@/components/leaderboard";
import { ProjectionsTable } from "@/components/projections-table";
import { UpgradeButton } from "@/components/upgrade-button";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { AdSlot } from "@/components/ad-slot";
import { DuesPanel } from "@/components/dues-panel";
import { AddEntryButton } from "@/components/add-entry-button";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { leagueId } = await params;
  const { upgraded } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}`);

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound(); // non-members can't see the league

  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: { include: { membership: { include: { user: { select: { name: true, id: true } } } } }, orderBy: { createdAt: "asc" } },
      draft: { select: { status: true } },
    },
  });
  const settings = tryParseLeagueSettings(league.settings);
  if (!settings) {
    return (
      <>
        <AppNav userName={user.name} />
        <main className="mx-auto max-w-2xl p-6">
          <h1 className="chalk chalk-h1 text-3xl">Something&apos;s wrong with this league</h1>
          <p className="mt-2 text-chalk-dim">Ask your commissioner to contact support.</p>
        </main>
      </>
    );
  }
  const isCommissioner = membership.role === "COMMISSIONER";
  const isDraftComplete = league.draft?.status === "COMPLETE";
  const scores = isDraftComplete ? await getLeagueScores(db, leagueId) : null;
  const projections =
    isDraftComplete && league.tier === "PREMIUM" ? await getLeagueProjections(db, leagueId) : null;

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="chalk chalk-h1 text-4xl sm:text-5xl">{league.name}</h1>
              {league.tier === "PREMIUM" && (
                <span className="chalk-badge">PREMIUM</span>
              )}
            </div>
            <p className="text-sm text-chalk-dim">
              {league.season} playoffs · {league.entries.length}/{settings.maxEntries} teams ·{" "}
              {settings.scoringPreset.replaceAll("_", " ")} scoring
            </p>
            {isCommissioner && league.tier === "FREE" && (
              <div className="mt-3">
                <UpgradeButton leagueId={league.id} priceLabel={formatPriceUsd(PREMIUM_PRICE_CENTS)} />
                <p className="mt-1 text-xs text-chalk-dim">Custom scoring, up to 25 teams, more leagues, no ads.</p>
              </div>
            )}
            {upgraded === "1" && league.tier === "FREE" && (
              <p className="mt-2 rounded p-2 text-sm text-chalk-dim">
                Payment received — premium activates in a few seconds; refresh if it doesn&apos;t.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCommissioner && (
              <Link
                href={`/leagues/${league.id}/settings`}
                className="chalk-btn chalk-btn-sm"
              >
                Settings
              </Link>
            )}
            {isCommissioner && <InviteLinkButton code={league.inviteCode} />}
          </div>
        </div>

        {scores && (
          <div className="mb-8">
            <h2 className="mb-3 chalk chalk-h2 text-3xl text-chalk-mint">Standings</h2>
            <Leaderboard leagueId={leagueId} scores={scores} />
          </div>
        )}

        {projections && projections.nextWeek !== null && (
          <div className="mb-8">
            <ProjectionsTable projections={projections} />
          </div>
        )}
        {isDraftComplete && league.tier === "FREE" && (
          <section className="mb-8 border-dashed p-4 chalk-card">
            <h2 className="flex items-center gap-2 chalk chalk-h2 text-3xl text-chalk-mint">
              Projections
              <span className="chalk-badge">PREMIUM</span>
            </h2>
            <p className="mt-1 text-sm text-chalk-dim">
              See every team&apos;s projected points — recent scoring × Vegas win probabilities. Included with
              Premium.
            </p>
            {/* No UpgradeButton here: the commissioner's upgrade CTA is already visible in the page header. */}
          </section>
        )}

        <h2 className="mb-3 chalk chalk-h2 text-3xl text-chalk-mint">Teams</h2>
        <ul className="flex flex-col gap-2">
          {league.entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between p-3 chalk-card">
              <span className="font-medium">{entry.name}</span>
              <span className="text-sm text-chalk-dim">
                {entry.membership.user.name}
                {entry.membership.role === "COMMISSIONER" && " · Commissioner"}
              </span>
            </li>
          ))}
        </ul>
        {/* Viewer is always a member here — non-members 404 above. */}
        {league.tier === "PREMIUM" && !league.draft && <AddEntryButton leagueId={league.id} />}

        {settings.entryFeeCents !== null && (
          <DuesPanel
            leagueId={league.id}
            isCommissioner={isCommissioner}
            entryFeeCents={settings.entryFeeCents}
            venmoHandle={settings.venmoHandle}
            entries={league.entries.map((e) => ({
              entryId: e.id,
              name: e.name,
              ownerName: e.membership.user.name ?? "",
              duesPaid: e.duesPaid,
              isMine: e.membership.user.id === user.id,
            }))}
          />
        )}

        <div className="mt-8">
          <DraftCard
            leagueId={league.id}
            isCommissioner={isCommissioner}
            draftStatus={league.draft?.status ?? "NOT_STARTED"}
            entryCount={league.entries.length}
            draftScheduledAt={league.draftScheduledAt?.toISOString() ?? null}
          />
        </div>

        {league.tier === "FREE" && (
          <div className="mt-8">
            <AdSlot />
          </div>
        )}
      </main>
    </>
  );
}
