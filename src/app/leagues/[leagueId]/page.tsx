import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { leagueSettingsSchema } from "@/domain/league-settings";
import { AppNav } from "@/components/app-nav";
import { InviteLinkButton } from "@/components/invite-link-button";

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
    },
  });
  const settings = leagueSettingsSchema.parse(league.settings);
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

        <p className="mt-8 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
          The draft opens once your league is set. Drafting, live scoring, and the leaderboard
          arrive in the next phases of the build.
        </p>
      </main>
    </>
  );
}
