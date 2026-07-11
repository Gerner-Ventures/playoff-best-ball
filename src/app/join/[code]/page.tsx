import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { tryParseLeagueSettings } from "@/domain/league-settings";
import { JoinLeagueForm } from "@/components/join-league-form";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/join/${code}`);

  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: {
      _count: { select: { entries: true } },
      draft: { select: { id: true } },
      memberships: { where: { userId: user.id }, include: { entries: { orderBy: { createdAt: "asc" } } } },
    },
  });

  if (!league) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Invite not found</h1>
        <p className="mt-2 text-gray-600">Double-check the link with your commissioner.</p>
      </main>
    );
  }

  // Only redirect if the member already has an entry; a membership without an entry falls through
  // to the join form so joinLeague can self-heal the orphaned membership.
  if ((league.memberships[0]?.entries.length ?? 0) > 0) redirect(`/leagues/${league.id}`);

  const settings = tryParseLeagueSettings(league.settings);
  if (!settings) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Something&apos;s wrong with this league</h1>
        <p className="mt-2 text-gray-600">Ask your commissioner to contact support.</p>
      </main>
    );
  }

  const isFull = league._count.entries >= settings.maxEntries;
  const isUserMember = (league.memberships[0]?.entries.length ?? 0) > 0;
  const draftStarted = league.draft !== null;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{league.name}</h1>
        <p className="mt-1 text-gray-600">
          {league.season} playoffs · {league._count.entries}/{settings.maxEntries} teams
        </p>
      </div>
      {draftStarted && !isUserMember ? (
        <p className="text-center text-red-600">
          The draft has already started — this league is closed to new teams.
        </p>
      ) : isFull ? (
        <p className="text-center text-red-600">
          This league is full. The commissioner can upgrade to Premium for more spots.
        </p>
      ) : (
        <JoinLeagueForm code={code} />
      )}
    </main>
  );
}
