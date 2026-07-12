import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AppNav } from "@/components/app-nav";
import { DraftRoom } from "@/components/draft/draft-room";

export default async function DraftPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/draft`);

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });

  return (
    <>
      <AppNav userName={user.name} />
      <DraftRoom leagueId={leagueId} leagueName={league.name} />
    </>
  );
}
