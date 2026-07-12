import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { tryParseLeagueSettings } from "@/domain/league-settings";
import { AppNav } from "@/components/app-nav";
import { InviteLinkButton } from "@/components/invite-link-button";
import { DraftCard } from "@/components/draft-card";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}`);

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound(); // non-members can't see the league

  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: { include: { membership: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } },
      draft: { select: { status: true } },
    },
  });
  const settings = tryParseLeagueSettings(league.settings);
  if (!settings) {
    return (
      <>
        <AppNav userName={user.name} />
        <main className="mx-auto max-w-2xl p-6">
          <h1 className="text-2xl font-bold">Something&apos;s wrong with this league</h1>
          <p className="mt-2 text-gray-600">Ask your commissioner to contact support.</p>
        </main>
      </>
    );
  }
  const isCommissioner = membership.role === "COMMISSIONER";

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{league.name}</h1>
            <p className="text-sm text-gray-500">
              {league.season} playoffs · {league.entries.length}/{settings.maxEntries} teams ·{" "}
              {settings.scoringPreset.replaceAll("_", " ")} scoring
            </p>
          </div>
          {isCommissioner && <InviteLinkButton code={league.inviteCode} />}
        </div>

        <h2 className="mb-3 font-semibold">Teams</h2>
        <ul className="flex flex-col gap-2">
          {league.entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">{entry.name}</span>
              <span className="text-sm text-gray-500">
                {entry.membership.user.name}
                {entry.membership.role === "COMMISSIONER" && " · Commissioner"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <DraftCard
            leagueId={league.id}
            isCommissioner={isCommissioner}
            draftStatus={league.draft?.status ?? "NOT_STARTED"}
            entryCount={league.entries.length}
            draftScheduledAt={league.draftScheduledAt?.toISOString() ?? null}
          />
        </div>
      </main>
    </>
  );
}
