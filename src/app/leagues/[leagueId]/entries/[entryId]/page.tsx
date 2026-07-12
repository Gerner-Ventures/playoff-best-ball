import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getLeagueScores } from "@/lib/league-scores";
import { AppNav } from "@/components/app-nav";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };

export default async function EntryPage({
  params,
}: {
  params: Promise<{ leagueId: string; entryId: string }>;
}) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/entries/${entryId}`);
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  // notFound when there's no draft at all — no lineups exist and the league page doesn't link here yet
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { draft: { select: { status: true } } },
  });
  if (!league.draft) notFound();

  let scores;
  try {
    scores = await getLeagueScores(db, leagueId);
  } catch {
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
  const entry = scores.entries.find((e) => e.entryId === entryId);
  if (!entry) notFound();
  const rank = scores.entries.findIndex((e) => e.entryId === entryId) + 1;

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">{entry.name}</h1>
        <p className="text-sm text-gray-500">
          {entry.ownerName} · #{rank} · {entry.grandTotal.toFixed(2)} pts ·{" "}
          <Link href={`/leagues/${leagueId}`} className="underline">back to league</Link>
        </p>
        {entry.weeks.map((week) => (
          <section key={week.week} className="mt-6">
            <h2 className="font-semibold">
              {WEEK_LABELS[week.week] ?? `Week ${week.week}`}{" "}
              <span className="text-gray-500">— {week.total.toFixed(2)} pts</span>
            </h2>
            <ul className="mt-2 rounded-lg border">
              {week.lineup.map((slot) => (
                <li
                  key={slot.slotIndex}
                  className={`flex items-center justify-between border-b p-2 text-sm last:border-b-0${slot.teamEliminated ? " text-gray-400" : ""}`}
                >
                  <span>
                    <span className="inline-block w-12 font-medium text-gray-500">{slot.slotLabel}</span>
                    {slot.playerId ? (
                      <Link href={`/leagues/${leagueId}/players/${slot.playerId}`} className="hover:underline">
                        {slot.playerName}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {slot.teamEliminated && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
                        OUT
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{slot.points.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {week.bench.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Bench: {week.bench.map((b) => `${b.playerName} ${b.points.toFixed(2)}`).join(" · ")}
              </p>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
