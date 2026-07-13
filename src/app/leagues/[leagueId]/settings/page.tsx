import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { tryParseLeagueSettings } from "@/domain/league-settings";
import { AppNav } from "@/components/app-nav";
import { UpgradeButton } from "@/components/upgrade-button";
import { formatPriceUsd, PREMIUM_PRICE_CENTS } from "@/lib/pricing";
import { LeagueSettingsForm } from "@/components/league-settings-form";

export default async function LeagueSettingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/settings`);
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership || membership.role !== "COMMISSIONER") notFound();

  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { duesInterest: { where: { userId: user.id }, select: { id: true } } },
  });
  const settings = tryParseLeagueSettings(league.settings);
  if (!settings) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Something&apos;s wrong with this league</h1>
        <p className="mt-2 text-gray-600">Ask your commissioner to contact support.</p>
      </main>
    );
  }

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">League settings</h1>
          {league.tier === "PREMIUM" ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PREMIUM</span>
          ) : (
            <UpgradeButton leagueId={league.id} priceLabel={formatPriceUsd(PREMIUM_PRICE_CENTS)} />
          )}
        </div>
        <LeagueSettingsForm
          leagueId={league.id}
          isPremium={league.tier === "PREMIUM"}
          initial={{
            scoringPreset: settings.scoringPreset,
            scoring: settings.scoring,
            entryFeeCents: settings.entryFeeCents,
            venmoHandle: settings.venmoHandle,
            substitutionsEnabled: settings.substitutionsEnabled,
          }}
          duesInterestJoined={league.duesInterest.length > 0}
        />
      </main>
    </>
  );
}
