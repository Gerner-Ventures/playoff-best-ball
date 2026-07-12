import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseLeagueSettings } from "@/domain/league-settings";
import { computePoints, roundPoints } from "@/domain/scoring/compute-points";
import { tryParseStatLine } from "@/domain/stats/stat-line";
import { AppNav } from "@/components/app-nav";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };
const CATEGORIES = ["passing", "rushing", "receiving", "kicking", "defense", "misc"] as const;

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ leagueId: string; playerId: string }>;
}) {
  const { leagueId, playerId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?callbackURL=/leagues/${leagueId}/players/${playerId}`);
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) notFound();

  const league = await db.league.findUniqueOrThrow({ where: { id: leagueId } });
  const player = await db.player.findUnique({
    where: { id: playerId },
    include: { stats: { where: { season: league.season }, orderBy: { week: "asc" } } },
  });
  if (!player || player.season !== league.season) notFound();
  const settings = parseLeagueSettings(league.settings);

  const games = player.stats.flatMap((row) => {
    const line = tryParseStatLine(row.stats);
    if (!line) return [];
    return [{ week: row.week, breakdown: computePoints(line, settings.scoring), line }];
  });

  return (
    <>
      <AppNav userName={user.name} />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">{player.name}</h1>
        <p className="text-sm text-gray-500">
          {player.position} · {player.nflTeam} ·{" "}
          <Link href={`/leagues/${leagueId}`} className="underline">back to league</Link>
        </p>
        {games.length === 0 && <p className="mt-6 text-gray-600">No stats yet this postseason.</p>}
        {games.map(({ week, breakdown, line }) => (
          <section key={week} className="mt-6 rounded-lg border p-4">
            <h2 className="flex items-center justify-between font-semibold">
              <span>{WEEK_LABELS[week] ?? `Week ${week}`}</span>
              <span className="tabular-nums">{roundPoints(breakdown.total).toFixed(2)} pts</span>
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {CATEGORIES.filter((c) => Math.abs(breakdown[c]) > 0.001).map((c) => (
                <div key={c}>
                  <dt className="text-gray-500 capitalize">{c}</dt>
                  <dd className="tabular-nums">{roundPoints(breakdown[c]).toFixed(2)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-gray-500">
              {[
                line.passYards ? `${line.passYards} pass yds, ${line.passTd} TD, ${line.passInt} INT` : null,
                line.rushYards ? `${line.rushYards} rush yds, ${line.rushTd} TD` : null,
                line.receptions ? `${line.receptions} rec, ${line.recYards} yds, ${line.recTd} TD` : null,
                line.fgMade.length ? `FG: ${line.fgMade.join(", ")}` : null,
                line.pointsAllowed !== null ? `${line.pointsAllowed} pts allowed` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        ))}
      </main>
    </>
  );
}
