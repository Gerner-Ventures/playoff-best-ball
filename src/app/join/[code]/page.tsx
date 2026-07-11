import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { leagueSettingsSchema } from "@/domain/league-settings";
import { JoinLeagueForm } from "@/components/join-league-form";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/join/${code}`);

  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { entries: true } }, memberships: { where: { userId: user.id } } },
  });

  if (!league) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Invite not found</h1>
        <p className="mt-2 text-gray-600">Double-check the link with your commissioner.</p>
      </main>
    );
  }

  if (league.memberships.length > 0) redirect(`/leagues/${league.id}`);

  const settings = leagueSettingsSchema.parse(league.settings);
  const isFull = league._count.entries >= settings.maxEntries;

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{league.name}</h1>
        <p className="mt-1 text-gray-600">
          {league.season} playoffs · {league._count.entries}/{settings.maxEntries} teams
        </p>
      </div>
      {isFull ? (
        <p className="text-center text-red-600">
          This league is full. The commissioner can upgrade to Premium for more spots.
        </p>
      ) : (
        <JoinLeagueForm code={code} />
      )}
    </main>
  );
}
