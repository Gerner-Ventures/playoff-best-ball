import type { PlayerPosition } from "@prisma/client";
import type {
  ProviderGame,
  ProviderGameState,
  ProviderPlayerStats,
  ProviderPoolPlayer,
} from "@/domain/stats/provider";
import { emptyStatLine, type StatLine } from "@/domain/stats/stat-line";

// ---------------------------------------------------------------------------
// Minimal ESPN response shapes — trimmed from legacy/src/lib/espn/types.ts,
// keeping only the fields this parser touches. Everything is optional because
// ESPN's public API is untyped and occasionally omits subtrees; the parser is
// defensive and skips malformed pieces rather than throwing.
// ---------------------------------------------------------------------------

interface EspnTeamRef {
  id?: string;
  abbreviation?: string;
  displayName?: string;
}
interface EspnCompetitor {
  id?: string;
  homeAway?: string;
  score?: string | number;
  team?: EspnTeamRef;
}
interface EspnCompetition {
  competitors?: EspnCompetitor[];
}
interface EspnEvent {
  id?: string;
  name?: string;
  date?: string;
  status?: { type?: { state?: string } };
  competitions?: EspnCompetition[];
}
interface EspnScoreboard {
  events?: EspnEvent[];
}

interface EspnAthleteEntry {
  athlete?: { id?: string; displayName?: string; firstName?: string; lastName?: string };
  stats?: string[];
}
interface EspnPlayerCategory {
  name?: string;
  labels?: string[];
  athletes?: EspnAthleteEntry[];
}
interface EspnPlayerSection {
  team?: EspnTeamRef;
  statistics?: EspnPlayerCategory[];
}
interface EspnTeamStat {
  name?: string;
  displayValue?: string;
}
interface EspnTeamBoxscore {
  team?: EspnTeamRef;
  statistics?: EspnTeamStat[];
}
interface EspnDrivePlay {
  type?: { text?: string };
  text?: string;
  statYardage?: number;
}
interface EspnSummary {
  header?: { competitions?: EspnCompetition[] };
  boxscore?: { teams?: EspnTeamBoxscore[]; players?: EspnPlayerSection[] };
  drives?: { previous?: { plays?: EspnDrivePlay[] }[]; current?: { plays?: EspnDrivePlay[] } };
}

interface EspnRosterItem {
  id?: string;
  displayName?: string;
  position?: { abbreviation?: string; name?: string };
}
interface EspnRoster {
  team?: EspnTeamRef;
  athletes?: { items?: EspnRosterItem[] }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a labelled column out of ESPN's parallel labels[]/stats[] arrays. */
function statByLabel(stats: string[], labels: string[], label: string): number {
  const idx = labels.indexOf(label);
  if (idx === -1) return 0;
  return parseFloat(stats[idx]) || 0;
}

/** ESPN gives "made/attempted" (e.g. "3/3"); return made and missed counts. */
function parseMadeAttempted(raw: string | undefined): { made: number; missed: number } {
  if (!raw) return { made: 0, missed: 0 };
  const [madeStr, attStr] = raw.split("/");
  const made = parseInt(madeStr) || 0;
  const attempted = attStr !== undefined ? parseInt(attStr) || made : made;
  return { made, missed: Math.max(0, attempted - made) };
}

/** ESPN abbreviation → our fantasy position, or null if non-fantasy. */
function mapPosition(abbr: string | undefined): PlayerPosition | null {
  switch ((abbr ?? "").toUpperCase()) {
    case "QB":
      return "QB";
    case "RB":
    case "FB": // legacy fantasy convention: fullbacks count as RB
      return "RB";
    case "WR":
      return "WR";
    case "TE":
      return "TE";
    case "K":
    case "PK": // ESPN uses "PK" (place kicker)
      return "K";
    default:
      return null;
  }
}

const STATE_MAP: Record<string, ProviderGameState> = {
  pre: "SCHEDULED",
  in: "IN_PROGRESS",
  post: "FINAL",
};

/** Last-name token from an ESPN abbreviated play name like "C.Little". */
function lastNameToken(name: string): string {
  // "M.Prater" -> "prater"; "Cam Little" -> "little"
  const cleaned = name.replace(/^[A-Z]\./, "").trim();
  const parts = cleaned.split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase().replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------
// parseScoreboard
// ---------------------------------------------------------------------------

export function parseScoreboard(scoreboard: unknown, ourWeek: number): ProviderGame[] {
  const data = scoreboard as EspnScoreboard;
  const events = data?.events;
  if (!Array.isArray(events)) {
    console.warn("[espn-parse] scoreboard has no events array");
    return [];
  }

  const games: ProviderGame[] = [];
  for (const event of events) {
    try {
      // Defensive: Pro Bowl shares seasontype=3 but is never a real matchup.
      if ((event.name ?? "").toLowerCase().includes("pro bowl")) continue;

      const competitors = event.competitions?.[0]?.competitors;
      if (!event.id || !Array.isArray(competitors) || competitors.length < 2) {
        console.warn(`[espn-parse] skipping event ${event.id ?? "?"}: missing competitors`);
        continue;
      }

      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      const homeTeam = home?.team?.abbreviation;
      const awayTeam = away?.team?.abbreviation;
      if (!homeTeam || !awayTeam) {
        console.warn(`[espn-parse] skipping event ${event.id}: missing team abbreviations`);
        continue;
      }

      const state = STATE_MAP[event.status?.type?.state ?? ""] ?? "SCHEDULED";

      games.push({
        eventId: event.id,
        week: ourWeek,
        homeTeam,
        awayTeam,
        startsAt: new Date(event.date ?? 0),
        state,
        homeScore: Number(home?.score ?? 0) || 0,
        awayScore: Number(away?.score ?? 0) || 0,
      });
    } catch (err) {
      console.warn(`[espn-parse] failed to parse event ${event?.id ?? "?"}:`, err);
    }
  }
  return games;
}

// ---------------------------------------------------------------------------
// parseGameStats
// ---------------------------------------------------------------------------

export function parseGameStats(summary: unknown): ProviderPlayerStats[] {
  const data = summary as EspnSummary;
  const box = data?.boxscore;

  // team id -> abbreviation, from the header competition.
  const teamIdToAbbrev = new Map<string, string>();
  const headerComp = data?.header?.competitions?.[0];
  for (const c of headerComp?.competitors ?? []) {
    if (c.id && c.team?.abbreviation) teamIdToAbbrev.set(c.id, c.team.abbreviation);
  }

  // Accumulate ONE stat line per athlete (athletes recur across categories).
  const byId = new Map<string, ProviderPlayerStats>();
  const ensure = (id: string, name: string, nflTeam: string): ProviderPlayerStats => {
    let line = byId.get(id);
    if (!line) {
      line = { externalId: id, name, position: null, nflTeam, stats: emptyStatLine() };
      byId.set(id, line);
    }
    return line;
  };

  for (const section of box?.players ?? []) {
    const teamAbbrev = teamIdToAbbrev.get(section.team?.id ?? "") ?? section.team?.abbreviation ?? "";
    for (const category of section.statistics ?? []) {
      const labels = category.labels ?? [];
      for (const entry of category.athletes ?? []) {
        try {
          const a = entry.athlete;
          if (!a?.id) continue; // can't key without an id
          const name =
            a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.displayName ?? "Unknown";
          const stats = entry.stats ?? [];
          const line = ensure(a.id, name, teamAbbrev);
          applyCategory(line.stats, category.name ?? "", stats, labels);
        } catch (err) {
          console.warn(`[espn-parse] skipping malformed athlete in ${category.name}:`, err);
        }
      }
    }
  }

  // Field goal distances (made + missed) come from the drive-by-drive plays,
  // which — unlike scoringPlays — also contain missed attempts with statYardage.
  applyFieldGoals(data, byId);

  const results: ProviderPlayerStats[] = [...byId.values()];

  // Synthesize the two DST pseudo-players.
  results.push(...deriveDstLines(data, teamIdToAbbrev));

  return results;
}

/** Fold one ESPN stat category into an accumulating StatLine. */
function applyCategory(stats: StatLine, category: string, cols: string[], labels: string[]): void {
  switch (category) {
    case "passing":
      stats.passYards += statByLabel(cols, labels, "YDS");
      stats.passTd += statByLabel(cols, labels, "TD");
      stats.passInt += statByLabel(cols, labels, "INT");
      break;
    case "rushing":
      stats.rushYards += statByLabel(cols, labels, "YDS");
      stats.rushTd += statByLabel(cols, labels, "TD");
      break;
    case "receiving":
      stats.recYards += statByLabel(cols, labels, "YDS");
      stats.recTd += statByLabel(cols, labels, "TD");
      stats.receptions += statByLabel(cols, labels, "REC");
      break;
    case "fumbles":
      // "LOST" column: fumbles lost by the offensive player.
      stats.fumblesLost += statByLabel(cols, labels, "LOST");
      break;
    case "kicking": {
      // FG distances are filled from drives; here we only take XP made/missed.
      const xpIdx = labels.indexOf("XP");
      if (xpIdx !== -1) {
        const xp = parseMadeAttempted(cols[xpIdx]);
        stats.xpMade += xp.made;
        stats.xpMissed += xp.missed;
      }
      break;
    }
  }
}

/**
 * Field-goal distances from `drives.previous[].plays[]`.
 *
 * ADAPTED from legacy: legacy read FG points out of `scoringPlays` text with a
 * distance regex, but scoringPlays only lists *made* kicks (misses don't score),
 * and StatLine wants both made and missed distances. The drive plays carry
 * `statYardage` and a "Field Goal Good" / "Field Goal Missed" type for every
 * attempt, so they are a strictly better source of truth. Kickers are matched
 * by last-name token (legacy's nameAppearsInText decision, kept).
 */
function applyFieldGoals(data: EspnSummary, byId: Map<string, ProviderPlayerStats>): void {
  const driveGroups = [...(data.drives?.previous ?? [])];
  if (data.drives?.current) driveGroups.push(data.drives.current);

  // last-name token -> kicker line (built from the players we already parsed)
  const kickerByLastName = new Map<string, ProviderPlayerStats>();
  for (const line of byId.values()) {
    kickerByLastName.set(lastNameToken(line.name), line);
  }

  for (const drive of driveGroups) {
    for (const play of drive.plays ?? []) {
      try {
        const type = (play.type?.text ?? "").toLowerCase();
        if (!type.includes("field goal")) continue;
        const distance = Number(play.statYardage);
        if (!Number.isFinite(distance) || distance <= 0) continue;

        const made = type.includes("good") || (!type.includes("miss") && !type.includes("no good"));

        // Match the kicker named in the play text (e.g. "C.Little 43 yard...").
        const nameMatch = (play.text ?? "").match(/^([A-Z]\.[A-Za-z'-]+)/);
        const token = nameMatch ? lastNameToken(nameMatch[1]) : "";
        const kicker = token ? kickerByLastName.get(token) : undefined;
        if (!kicker) {
          console.warn(`[espn-parse] no kicker matched for FG play: ${play.text}`);
          continue;
        }
        if (made) kicker.stats.fgMade.push(distance);
        else kicker.stats.fgMissed.push(distance);
      } catch (err) {
        console.warn("[espn-parse] skipping malformed FG play:", err);
      }
    }
  }
}

/**
 * Two DST lines per game. Ported from legacy parseDefenseStats:
 *   - pointsAllowed = the OPPOSING competitor's final score (header).
 *   - sacks / INTs / fumbles recovered read from the OPPONENT's team boxscore
 *     ("sacksYardsLost", "interceptions", "fumblesLost" — i.e. what the opponent
 *     gave up equals what this defense produced).
 *   - defensiveTd / safeties read from the team's OWN boxscore.
 * externalId is `dst-{TEAM}`, name is "{Team} D/ST".
 */
function deriveDstLines(
  data: EspnSummary,
  teamIdToAbbrev: Map<string, string>
): ProviderPlayerStats[] {
  const teams = data.boxscore?.teams ?? [];
  const headerComp = data.header?.competitions?.[0];
  const competitors = headerComp?.competitors ?? [];
  const lines: ProviderPlayerStats[] = [];

  for (const teamData of teams) {
    try {
      const teamId = teamData.team?.id;
      const abbrev = teamData.team?.abbreviation ?? (teamId ? teamIdToAbbrev.get(teamId) : "");
      if (!teamId || !abbrev) {
        console.warn("[espn-parse] skipping DST: missing team id/abbrev");
        continue;
      }

      // Opponent points allowed from header (skip if game hasn't produced a score).
      const oppComp = competitors.find((c) => c.id !== teamId);
      const pointsAllowed = oppComp ? parseInt(String(oppComp.score)) : NaN;
      if (Number.isNaN(pointsAllowed)) {
        console.warn(`[espn-parse] skipping DST ${abbrev}: no score yet`);
        continue;
      }

      const opponent = teams.find((t) => t.team?.id !== teamId);
      const oppStat = (name: string): string =>
        opponent?.statistics?.find((s) => s.name === name)?.displayValue ?? "0";
      const ownStat = (name: string): number =>
        parseFloat(teamData.statistics?.find((s) => s.name === name)?.displayValue ?? "0") || 0;

      const sacks = parseInt(oppStat("sacksYardsLost").split("-")[0]) || 0;
      const defInterceptions = parseInt(oppStat("interceptions")) || 0;
      const fumblesRecovered = parseInt(oppStat("fumblesLost")) || 0;
      const defensiveTd = ownStat("defensiveTouchdowns");
      const safeties = ownStat("safeties");

      const stats = emptyStatLine();
      stats.sacks = sacks;
      stats.defInterceptions = defInterceptions;
      stats.fumblesRecovered = fumblesRecovered;
      stats.defensiveTd = defensiveTd;
      stats.safeties = safeties;
      stats.pointsAllowed = pointsAllowed;

      lines.push({
        externalId: `dst-${abbrev}`,
        name: `${teamData.team?.displayName ?? abbrev} D/ST`,
        position: "DST",
        nflTeam: abbrev,
        stats,
      });
    } catch (err) {
      console.warn("[espn-parse] failed to derive a DST line:", err);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// parseRoster
// ---------------------------------------------------------------------------

export function parseRoster(roster: unknown, team: string): ProviderPoolPlayer[] {
  const data = roster as EspnRoster;
  const players: ProviderPoolPlayer[] = [];

  for (const group of data?.athletes ?? []) {
    for (const item of group.items ?? []) {
      try {
        const position = mapPosition(item.position?.abbreviation);
        if (!position) continue; // skip non-fantasy positions (OL, DL, DB, ...)
        if (!item.id || !item.displayName) {
          console.warn(`[espn-parse] skipping roster item: missing id/name`);
          continue;
        }
        players.push({
          externalId: item.id,
          name: item.displayName,
          position,
          nflTeam: team,
        });
      } catch (err) {
        console.warn("[espn-parse] skipping malformed roster item:", err);
      }
    }
  }

  // Append the team DST pseudo-player.
  players.push({
    externalId: `dst-${team}`,
    name: `${data?.team?.displayName ?? team} D/ST`,
    position: "DST",
    nflTeam: team,
  });

  return players;
}
