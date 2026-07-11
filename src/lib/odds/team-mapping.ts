// Map The Odds API team names to our abbreviations
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

// Reverse mapping for lookups
export const ABBREVIATION_TO_FULL: Record<string, string> = Object.fromEntries(
  Object.entries(ODDS_API_TEAM_MAP).map(([full, abbr]) => [abbr, full])
);

export function normalizeTeamName(name: string): string | null {
  // Direct match
  if (ODDS_API_TEAM_MAP[name]) {
    return ODDS_API_TEAM_MAP[name];
  }

  // Already an abbreviation
  if (ABBREVIATION_TO_FULL[name]) {
    return name;
  }

  // Fuzzy match - check if the name contains a key team name
  const lowerName = name.toLowerCase();
  for (const [fullName, abbr] of Object.entries(ODDS_API_TEAM_MAP)) {
    if (lowerName.includes(fullName.toLowerCase().split(" ").pop() || "")) {
      return abbr;
    }
  }

  return null;
}
