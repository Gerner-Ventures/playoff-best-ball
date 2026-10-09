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

  // The draft room is the one dark route — see the .theme-dark note in globals.css.
  // Scoped at the page so the nav goes dark with it and there's no seam mid-screen.
  return (
    <div className="theme-dark flex flex-1 flex-col">
      <AppNav userName={user.name} />
      <DraftRoom leagueId={leagueId} leagueName={league.name} />
    </div>
  );
}
