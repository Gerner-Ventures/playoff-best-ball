import type { PlayerPosition } from "@prisma/client";
import type {
  ProviderGame,
  ProviderGameState,
  ProviderPlayerStats,
  ProviderPoolPlayer,
} from "@/domain/stats/provider";
import { emptyStatLine, type StatLine } from "@/domain/stats/stat-line";

// ---------------------------------------------------------------------------
// Minimal ESPN response shapes — trimmed from the prototype's ESPN types (deleted with legacy/).
// Everything is optional because ESPN's public API is untyped and occasionally omits subtrees;
// the parser is defensive and skips malformed pieces rather than throwing.
// Known gap: blockedKicks is never populated (no reliable boxscore source identified) — tracked for Phase 5.
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
  season?: { year?: number };
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
interface EspnScoringPlay {
  type?: { text?: string };
  text?: string;
}
interface EspnSummary {
  header?: { competitions?: EspnCompetition[] };
  boxscore?: { teams?: EspnTeamBoxscore[]; players?: EspnPlayerSection[] };
  drives?: { previous?: { plays?: EspnDrivePlay[] }[]; current?: { plays?: EspnDrivePlay[] } };
  scoringPlays?: EspnScoringPlay[];
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

// Known ESPN abbreviation mismatches vs. our canonical set — extend as mismatches surface via the unmatched report.
const TEAM_ALIASES: Record<string, string> = {
  JAC: "JAX",
  WSH: "WAS",
};

function normalizeTeam(abbr: string): string {
  const upper = abbr.toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
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

export function parseScoreboard(
  scoreboard: unknown,
  ourWeek: number,
  expectedSeason?: number,
): ProviderGame[] {
  const data = scoreboard as EspnScoreboard;

  if (expectedSeason !== undefined) {
    const payloadYear = data?.season?.year;
    if (payloadYear !== expectedSeason) {
      console.warn(
        `[espn] scoreboard season mismatch: wanted ${expectedSeason} got ${payloadYear} — returning no games`,
      );
      return [];
    }
  }

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
      const homeTeam = home?.team?.abbreviation ? normalizeTeam(home.team.abbreviation) : undefined;
      const awayTeam = away?.team?.abbreviation ? normalizeTeam(away.team.abbreviation) : undefined;
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
    if (c.id && c.team?.abbreviation) teamIdToAbbrev.set(c.id, normalizeTeam(c.team.abbreviation));
  }

  // Accumulate ONE stat line per athlete (athletes recur across categories).
  const byId = new Map<string, ProviderPlayerStats>();
  // Athlete ids that appeared in the KICKING category — used to build a kicker
  // lookup that excludes same-surname skill players (see applyFieldGoals).
  const kickerIds = new Set<string>();
  const ensure = (id: string, name: string, nflTeam: string): ProviderPlayerStats => {
    let line = byId.get(id);
    if (!line) {
      line = { externalId: id, name, position: null, nflTeam, stats: emptyStatLine() };
      byId.set(id, line);
    }
    return line;
  };

  for (const section of box?.players ?? []) {
    const teamAbbrev = normalizeTeam(teamIdToAbbrev.get(section.team?.id ?? "") ?? section.team?.abbreviation ?? "");
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
          if (category.name === "kicking") kickerIds.add(a.id);
          applyCategory(line.stats, category.name ?? "", stats, labels);
        } catch (err) {
          console.warn(`[espn-parse] skipping malformed athlete in ${category.name}:`, err);
        }
      }
    }
  }

  // Field goal distances (made + missed) come from the drive-by-drive plays,
  // which — unlike scoringPlays — also contain missed attempts with statYardage.
  applyFieldGoals(data, byId, kickerIds);

  // Two-point conversions come from scoringPlays text (ported from legacy).
  applyTwoPointConversions(data, byId);

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
    case "kickReturns":
    case "puntReturns":
      // "TD" column: return touchdowns, summed across kick + punt returns.
      stats.returnTd += statByLabel(cols, labels, "TD");
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
function applyFieldGoals(
  data: EspnSummary,
  byId: Map<string, ProviderPlayerStats>,
  kickerIds: Set<string>
): void {
  const driveGroups = [...(data.drives?.previous ?? [])];
  if (data.drives?.current) driveGroups.push(data.drives.current);

  // last-name token -> kicker line
  // Map only kicking-category athletes: prevents FG distances landing on a same-surname skill player.
  const kickerByLastName = new Map<string, ProviderPlayerStats>();
  for (const line of byId.values()) {
    if (!kickerIds.has(line.externalId)) continue;
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
 * Two-point conversions from `scoringPlays[].text` (ported from legacy
 * processScoringPlays/processTwoPointConversion).
 *
 * scoringPlays only lists *successful* scores, so a 2-pt entry that appears is a
 * made conversion — but ESPN also embeds failed tries inside touchdown play text,
 * so we still guard against explicit failure words. Every parsed player named in
 * the 2-pt clause is credited (a passer + receiver, or a lone rusher), mirroring
 * legacy's nameAppearsInText fan-out with the same last-name-token matching the
 * FG logic uses.
 *
 * Two refinements over the naive legacy port, both verified against live ESPN
 * playoff data (event 401772981): (1) ESPN nests the conversion inside the TD
 * play text like "Zaccheaus 8 Yd pass from Williams (Williams Pass to Loveland
 * for Two-Point Conversion)"; we scope matching to the parenthetical clause so
 * the TD scorer (Zaccheaus) is NOT credited. (2) We match last-name tokens on
 * word boundaries so "Love" does not falsely match "Loveland".
 *
 * Residual limitation (inherent to last-name matching, same class Fix 3 solves
 * for kickers): a same-surname player on the other team can still collide — e.g.
 * GB's "Evan Williams" also matches CHI's "Caleb Williams" in the clause above.
 * Names alone cannot disambiguate that; a play→team association would be needed.
 */
function applyTwoPointConversions(
  data: EspnSummary,
  byId: Map<string, ProviderPlayerStats>
): void {
  for (const play of data.scoringPlays ?? []) {
    try {
      const text = play.text ?? "";
      const simple = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!simple.includes("twopoint") && !simple.includes("2pt")) continue;

      // Skip failed attempts (defensive: a failed 2-pt shouldn't score, and can
      // surface embedded in TD play text).
      if (/fail|incomplete|no good|intercepted/i.test(text)) continue;

      // Scope to the 2-pt clause: prefer a parenthetical that mentions the
      // conversion; otherwise fall back to the whole text (lone rush/pass plays
      // may not be parenthesized).
      const paren = [...text.matchAll(/\(([^)]*)\)/g)]
        .map((m) => m[1])
        .find((c) => /two[\s-]?point|2\s*pt/i.test(c));
      const clause = (paren ?? text).toLowerCase();

      for (const line of byId.values()) {
        const token = lastNameToken(line.name);
        // Word-boundary match so "love" doesn't hit "loveland".
        if (token.length > 2 && new RegExp(`\\b${token}\\b`).test(clause)) {
          line.stats.twoPtConv += 1;
        }
      }
    } catch (err) {
      console.warn("[espn-parse] skipping malformed 2-pt play:", err);
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
      const rawAbbrev = teamData.team?.abbreviation ?? (teamId ? teamIdToAbbrev.get(teamId) : "");
      const abbrev = rawAbbrev ? normalizeTeam(rawAbbrev) : rawAbbrev;
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
  const normalizedTeam = normalizeTeam(team);
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
          nflTeam: normalizedTeam,
        });
      } catch (err) {
        console.warn("[espn-parse] skipping malformed roster item:", err);
      }
    }
  }

  // Append the team DST pseudo-player.
  players.push({
    externalId: `dst-${normalizedTeam}`,
    name: `${data?.team?.displayName ?? normalizedTeam} D/ST`,
    position: "DST",
    nflTeam: normalizedTeam,
  });

  return players;
}
