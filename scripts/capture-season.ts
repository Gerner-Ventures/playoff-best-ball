/**
 * Captures a real NFL postseason from ESPN into a committed fixture.
 *
 *   npm run demo:capture -- --season=2024
 *
 * Dev-only, run by hand, never imported by the app. The output is committed, so
 * the demo depends on the file rather than on ESPN's archive still being there.
 *
 * Two things to know about where the data comes from:
 *
 * 1. The pool is derived from the BOX SCORES, not from the roster endpoint.
 *    `/teams/{abbr}/roster` ignores the season and returns today's roster, so any
 *    player who has since changed teams or retired would be missing — and
 *    syncWeekStats would file their stat lines under `unmatched`, silently
 *    dropping their points from the demo. Every player who recorded a stat is in
 *    the box scores by construction, with the team they played for at the time.
 *
 * 2. Box-score lines carry no position, so positions are resolved separately:
 *    current rosters first (14 requests, covers most), then the per-athlete
 *    endpoint for whoever is left (moved teams, retired). Players whose position
 *    is not fantasy-relevant (OL, DB, ...) are dropped from the pool.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { espnProvider } from "@/lib/stats/espn-provider";
import { mapPosition } from "@/lib/stats/espn-parse";
import { computePoints } from "@/domain/scoring/compute-points";
import { SCORING_PRESETS, DEFAULT_ROSTER_SLOTS } from "@/domain/league-settings";
import { PLAYOFF_WEEKS } from "@/domain/season";
import {
  demoSeasonSnapshotSchema,
  snapshotPath,
  type DemoSeasonSnapshot,
} from "@/lib/demo/season-snapshot";
import type { PlayerPosition } from "@prisma/client";
import type { ProviderGame, ProviderPlayerStats } from "@/domain/stats/provider";

const ATHLETE_API = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes";

/** Games per playoff round in the modern 14-team format. */
const EXPECTED_GAMES: Record<number, number> = { 1: 6, 2: 4, 3: 2, 4: 1 };

/** A 12-team league drafting DEFAULT_ROSTER_SLOTS is the demo's hardest requirement. */
const TARGET_ENTRIES = 12;

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolvePositions(
  season: number,
  teams: string[],
  needed: Map<string, { name: string; nflTeam: string }>,
): Promise<Map<string, PlayerPosition>> {
  const found = new Map<string, PlayerPosition>();

  // Pass 1: current rosters of the playoff teams. Cheap and covers most players.
  for (const team of teams) {
    try {
      for (const p of await espnProvider.fetchTeamRoster(season, team)) {
        if (needed.has(p.externalId)) found.set(p.externalId, p.position);
      }
    } catch (err) {
      console.warn(`  roster ${team} failed (continuing): ${(err as Error).message}`);
    }
  }
  console.log(`  positions from rosters: ${found.size}/${needed.size}`);

  // Pass 2: per-athlete lookups for whoever is left — moved teams, retired, or on
  // a team that missed these playoffs. This is why the capture is historical-safe.
  const missing = [...needed.keys()].filter((id) => !found.has(id));
  let unmapped = 0;
  for (const [i, id] of missing.entries()) {
    try {
      const res = await fetch(`${ATHLETE_API}/${id}`);
      if (res.ok) {
        const body = (await res.json()) as { athlete?: { position?: { abbreviation?: string } } };
        const position = mapPosition(body.athlete?.position?.abbreviation);
        if (position) found.set(id, position);
        else unmapped++;
      }
    } catch {
      // A single unresolvable athlete is not worth failing the capture over; the
      // pool assertions below decide whether the result is still usable.
    }
    if (i % 25 === 24) {
      console.log(`  athlete lookups: ${i + 1}/${missing.length}`);
      await sleep(250); // be polite to a public API
    }
  }
  console.log(`  positions after athlete lookups: ${found.size}/${needed.size} (${unmapped} non-fantasy)`);
  return found;
}

function assertUsable(snapshot: DemoSeasonSnapshot): void {
  const problems: string[] = [];

  for (const [week, expected] of Object.entries(EXPECTED_GAMES)) {
    const actual = snapshot.weeks.find((w) => w.week === Number(week))?.games.length ?? 0;
    if (actual !== expected) problems.push(`week ${week}: expected ${expected} games, got ${actual}`);
  }

  for (const { games } of snapshot.weeks) {
    for (const g of games) {
      if (g.homeScore === g.awayScore) {
        // getEliminatedTeams derives the eliminated set from FINAL losers; a tie
        // would leave a playoff round with no loser, which cannot happen.
        problems.push(`${g.eventId} (${g.awayTeam}@${g.homeTeam}) is a tie`);
      }
      const lines = snapshot.stats[g.eventId] ?? [];
      // Counted AFTER non-fantasy players are filtered out, so this is roughly
      // 11 skill players per side plus 2 DSTs. A real game lands around 25; the
      // floor is set to catch a truncated or half-parsed box score, not to
      // second-guess a quiet game.
      if (lines.length < 18) problems.push(`${g.eventId}: only ${lines.length} stat lines`);
      const dst = lines.filter((l) => l.position === "DST").length;
      if (dst !== 2) problems.push(`${g.eventId}: ${dst} DST lines, expected 2`);
    }
  }

  // Every stat line must match a pool player or syncWeekStats drops its points.
  const poolIds = new Set(snapshot.pool.map((p) => p.externalId));
  const orphans = new Set<string>();
  for (const lines of Object.values(snapshot.stats)) {
    for (const l of lines) if (!poolIds.has(l.externalId)) orphans.add(`${l.name} (${l.externalId})`);
  }
  if (orphans.size > 0) {
    problems.push(`${orphans.size} stat lines have no pool player: ${[...orphans].slice(0, 5).join(", ")}…`);
  }

  // Must be able to fill 12 rosters, or startDraftForLeague throws before the
  // demo's premium league can even draft. TE and DST are the tight ones.
  const counts = new Map<PlayerPosition, number>();
  for (const p of snapshot.pool) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
  let flexSurplus = 0;
  for (const slot of ["QB", "RB", "WR", "TE", "K", "DST"] as const) {
    const need = DEFAULT_ROSTER_SLOTS.filter((s) => s.slot === slot).length * TARGET_ENTRIES;
    const have = counts.get(slot) ?? 0;
    if (have < need) problems.push(`pool has ${have} ${slot}, needs ${need} for ${TARGET_ENTRIES} teams`);
    if (slot === "RB" || slot === "WR" || slot === "TE") flexSurplus += have - need;
  }
  const flexNeed = DEFAULT_ROSTER_SLOTS.filter((s) => s.slot === "FLEX").length * TARGET_ENTRIES;
  if (flexSurplus < flexNeed) problems.push(`flex surplus ${flexSurplus} < ${flexNeed} needed`);

  // Field-goal distances come from the drives subtree, which thins out for older
  // seasons. No made FGs across a whole postseason means kickers score nothing.
  const anyFg = Object.values(snapshot.stats).some((lines) =>
    lines.some((l) => l.stats.fgMade.length > 0),
  );
  if (!anyFg) problems.push("no made field goals in the whole season — drives subtree likely missing");

  if (problems.length > 0) {
    throw new Error(`Captured season is not usable:\n  - ${problems.join("\n  - ")}`);
  }
}

async function main() {
  const season = Number(arg("season"));
  if (!Number.isInteger(season)) throw new Error("usage: demo:capture -- --season=2024");

  console.log(`Capturing NFL ${season} postseason from ESPN…`);
  const weeks: { week: number; games: ProviderGame[] }[] = [];
  const stats: Record<string, ProviderPlayerStats[]> = {};

  for (const week of Object.values(PLAYOFF_WEEKS)) {
    const games = await espnProvider.fetchWeekGames(season, week);
    console.log(`  week ${week}: ${games.length} games`);
    weeks.push({ week, games });
    for (const g of games) {
      stats[g.eventId] = await espnProvider.fetchGameStats(g.eventId);
    }
  }

  const teams = [...new Set(weeks.flatMap((w) => w.games.flatMap((g) => [g.homeTeam, g.awayTeam])))].sort();
  console.log(`  ${teams.length} playoff teams: ${teams.join(", ")}`);

  // Pool from the box scores. DST lines already carry a position; everyone else
  // needs resolving. Keep the FIRST team a player appears for — the team they
  // played for in these playoffs, which is what scoring and eliminations use.
  const seen = new Map<string, { name: string; nflTeam: string; position: PlayerPosition | null }>();
  for (const lines of Object.values(stats)) {
    for (const l of lines) {
      if (!seen.has(l.externalId)) {
        seen.set(l.externalId, { name: l.name, nflTeam: l.nflTeam, position: l.position });
      }
    }
  }
  const needPosition = new Map(
    [...seen.entries()].filter(([, v]) => v.position === null).map(([k, v]) => [k, v]),
  );
  console.log(`  ${seen.size} distinct players; ${needPosition.size} need a position`);

  const resolved = await resolvePositions(season, teams, needPosition);

  const pool = [...seen.entries()]
    .map(([externalId, v]) => ({
      externalId,
      name: v.name,
      nflTeam: v.nflTeam,
      position: v.position ?? resolved.get(externalId) ?? null,
    }))
    .filter((p): p is { externalId: string; name: string; nflTeam: string; position: PlayerPosition } =>
      p.position !== null,
    );
  console.log(`  pool: ${pool.length} fantasy-relevant players`);

  // Drop stat lines for players who fell out of the pool (non-fantasy positions),
  // so the "every line has a pool player" invariant holds.
  const poolIds = new Set(pool.map((p) => p.externalId));
  for (const [eventId, lines] of Object.entries(stats)) {
    stats[eventId] = lines.filter((l) => poolIds.has(l.externalId));
  }

  const snapshot: DemoSeasonSnapshot = demoSeasonSnapshotSchema.parse({
    schemaVersion: 1,
    capturedSeason: season,
    label: `${season} playoffs (Jan ${season + 1})`,
    capturedAt: new Date().toISOString(),
    source: "espn",
    teams,
    weeks: weeks.map((w) => ({
      week: w.week,
      games: w.games.map((g) => ({
        eventId: g.eventId,
        week: g.week,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        startsAt: g.startsAt.toISOString(),
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      })),
    })),
    stats,
    pool,
  });

  assertUsable(snapshot);

  const out = snapshotPath(season);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");

  const top = Object.values(stats)
    .flat()
    .map((l) => ({ name: l.name, pts: computePoints(l.stats, SCORING_PRESETS.half_ppr).total }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 5);
  console.log(`\nWrote ${out}`);
  console.log(`  top scorers: ${top.map((t) => `${t.name} ${t.pts.toFixed(1)}`).join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
