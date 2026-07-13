// Ported from the prototype's odds team mapping. The Odds API sends full team
// names; we store the same abbreviations our ESPN adapter writes to NflGame
// (its parser canonicalizes WSH→WAS and JAC→JAX, so this map already agrees).
export const ODDS_API_TEAM_MAP: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
};

// Reverse mapping for "already an abbreviation" lookups
const ABBREVIATION_TO_FULL: Record<string, string> = Object.fromEntries(
  Object.entries(ODDS_API_TEAM_MAP).map(([full, abbr]) => [abbr, full]),
);

/**
 * Full name → our abbreviation. Unlike the prototype (which returned null),
 * unknown names pass through unchanged — syncTeamOdds already ignores games
 * whose teams don't match one of our scheduled pairings.
 */
export function normalizeTeamName(name: string): string {
  // Direct match
  if (ODDS_API_TEAM_MAP[name]) return ODDS_API_TEAM_MAP[name];

  // Already an abbreviation
  if (ABBREVIATION_TO_FULL[name]) return name;

  // Fuzzy match — the nickname (last word) appears somewhere in the name
  const lowerName = name.toLowerCase();
  for (const [fullName, abbr] of Object.entries(ODDS_API_TEAM_MAP)) {
    if (lowerName.includes(fullName.toLowerCase().split(" ").pop() ?? "")) {
      return abbr;
    }
  }

  return name;
}
