"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { TeamLogo } from "./team-logo";

interface BracketGame {
  eventId: string;
  week: number;
  name: string;
  shortName: string;
  status: {
    state: "pre" | "in" | "post";
    completed: boolean;
    description: string;
    detail: string;
    displayClock?: string;
    period?: number;
  };
  homeTeam: {
    abbreviation: string;
    displayName: string;
    score: number;
  };
  awayTeam: {
    abbreviation: string;
    displayName: string;
    score: number;
  };
  conference?: "AFC" | "NFC";
  // Enhanced data from odds and weather APIs
  weather?: {
    temperature: number;
    windSpeed: number;
    windDirection: string;
    condition: string;
    isDome: boolean;
    icon: string;
    impact: { level: string; description: string };
  };
  homeWinProb?: number;
  awayWinProb?: number;
}

interface BracketData {
  games: BracketGame[];
  eliminatedTeams: string[];
  lastUpdated: string;
}

// AFC and NFC team abbreviations
const AFC_TEAMS = new Set([
  "BUF",
  "MIA",
  "NE",
  "NYJ",
  "BAL",
  "CIN",
  "CLE",
  "PIT",
  "HOU",
  "IND",
  "JAX",
  "TEN",
  "DEN",
  "KC",
  "LV",
  "LAC",
]);

const NFC_TEAMS = new Set([
  "DAL",
  "NYG",
  "PHI",
  "WAS",
  "WSH",
  "CHI",
  "DET",
  "GB",
  "MIN",
  "ATL",
  "CAR",
  "NO",
  "TB",
  "ARI",
  "LAR",
  "SF",
  "SEA",
]);

function getConference(team1: string, team2: string): "AFC" | "NFC" | undefined {
  const t1 = team1.toUpperCase();
  const t2 = team2.toUpperCase();
  if (AFC_TEAMS.has(t1) || AFC_TEAMS.has(t2)) return "AFC";
  if (NFC_TEAMS.has(t1) || NFC_TEAMS.has(t2)) return "NFC";
  return undefined;
}

function GameStatusBadge({ status }: { status: BracketGame["status"] }) {
  if (status.state === "in") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-400 text-[10px] font-medium animate-pulse">
        <span className="w-1 h-1 bg-green-400 rounded-full"></span>
        LIVE
      </span>
    );
  }
  if (status.completed) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-700/50 text-gray-400 text-[10px] font-medium">
        FINAL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-900/50 text-blue-400 text-[10px] font-medium">
      {status.detail}
    </span>
  );
}

function formatQuarter(period?: number): string {
  if (!period) return "";
  if (period <= 4) return `Q${period}`;
  return `OT${period - 4 > 1 ? period - 4 : ""}`;
}

// Get weather impact color
function getWeatherImpactColor(level: string): string {
  switch (level) {
    case "high":
      return "text-red-400";
    case "medium":
      return "text-yellow-400";
    case "low":
      return "text-blue-300";
    default:
      return "text-[var(--chalk-muted)]";
  }
}

function BracketGameCard({
  game,
  eliminatedTeams,
  size = "normal",
}: {
  game: BracketGame;
  eliminatedTeams: string[];
  size?: "normal" | "large";
}) {
  const awayWinning = game.awayTeam.score > game.homeTeam.score;
  const homeWinning = game.homeTeam.score > game.awayTeam.score;
  const isLive = game.status.state === "in";
  const isScheduled = game.status.state === "pre";
  const awayEliminated = eliminatedTeams.includes(game.awayTeam.abbreviation.toUpperCase());
  const homeEliminated = eliminatedTeams.includes(game.homeTeam.abbreviation.toUpperCase());

  const sizeClasses =
    size === "large" ? "w-full lg:min-w-[180px] p-3" : "w-full lg:min-w-[140px] p-2";
  const teamTextSize = size === "large" ? "text-sm" : "text-xs";
  const scoreTextSize = size === "large" ? "text-lg" : "text-sm";

  // Win probabilities (convert from 0-1 range to 0-100 percentage)
  const awayProb = (game.awayWinProb ?? 0.5) * 100;
  const homeProb = (game.homeWinProb ?? 0.5) * 100;

  return (
    <Link
      href={`/game/${game.eventId}`}
      className={`block ${sizeClasses} rounded-lg bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] hover:border-[var(--chalk-blue)] hover:bg-[rgba(0,0,0,0.4)] transition-all cursor-pointer`}
    >
      {/* Status + Weather */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <GameStatusBadge status={game.status} />
          {/* Weather indicator */}
          {game.weather && (
            <span
              className={`text-[10px] ${getWeatherImpactColor(game.weather.impact.level)}`}
              title={`${game.weather.temperature}°F, ${game.weather.windSpeed}mph - ${game.weather.impact.description}`}
            >
              {game.weather.icon}
            </span>
          )}
        </div>
        {isLive && game.status.displayClock && (
          <span className="text-[10px] text-green-400">
            {formatQuarter(game.status.period)} {game.status.displayClock}
          </span>
        )}
      </div>

      {/* Away Team */}
      <div
        className={`flex items-center justify-between py-1 ${awayEliminated ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <TeamLogo
            abbreviation={game.awayTeam.abbreviation}
            size={size === "large" ? "sm" : "xs"}
          />
          <span
            className={`${teamTextSize} font-bold ${
              game.status.completed && awayWinning
                ? "text-[var(--chalk-green)]"
                : awayEliminated
                  ? "text-red-400"
                  : "text-[var(--chalk-white)]"
            }`}
          >
            {game.awayTeam.abbreviation}
          </span>
          {awayEliminated && (
            <span className="text-[8px] text-red-400 bg-red-900/30 px-1 rounded">OUT</span>
          )}
        </div>
        <span
          className={`${scoreTextSize} font-bold ${
            game.status.state !== "pre"
              ? awayWinning
                ? "text-[var(--chalk-green)]"
                : "text-[var(--chalk-white)]"
              : "text-[var(--chalk-muted)]"
          }`}
        >
          {game.status.state !== "pre" ? game.awayTeam.score : "-"}
        </span>
      </div>

      {/* Home Team */}
      <div
        className={`flex items-center justify-between py-1 ${homeEliminated ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <TeamLogo
            abbreviation={game.homeTeam.abbreviation}
            size={size === "large" ? "sm" : "xs"}
          />
          <span
            className={`${teamTextSize} font-bold ${
              game.status.completed && homeWinning
                ? "text-[var(--chalk-green)]"
                : homeEliminated
                  ? "text-red-400"
                  : "text-[var(--chalk-white)]"
            }`}
          >
            {game.homeTeam.abbreviation}
          </span>
          {homeEliminated && (
            <span className="text-[8px] text-red-400 bg-red-900/30 px-1 rounded">OUT</span>
          )}
        </div>
        <span
          className={`${scoreTextSize} font-bold ${
            game.status.state !== "pre"
              ? homeWinning
                ? "text-[var(--chalk-green)]"
                : "text-[var(--chalk-white)]"
              : "text-[var(--chalk-muted)]"
          }`}
        >
          {game.status.state !== "pre" ? game.homeTeam.score : "-"}
        </span>
      </div>

      {/* Win Probability Bar - Show for scheduled or live games */}
      {(isScheduled || isLive) && (
        <div className="mt-1.5 pt-1.5 border-t border-dashed border-[rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-1 text-[8px] text-[var(--chalk-muted)]">
            <span className="w-6 text-right">{Math.round(awayProb)}%</span>
            <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--chalk-blue)] to-[var(--chalk-green)]"
                style={{ width: `${awayProb}%` }}
              />
            </div>
            <span className="w-6">{Math.round(homeProb)}%</span>
          </div>
        </div>
      )}
    </Link>
  );
}

function ConnectorLine({ direction }: { direction: "right" | "left" }) {
  return (
    <div
      className={`hidden lg:flex items-center ${direction === "right" ? "justify-start" : "justify-end"}`}
    >
      <div className="w-8 h-px bg-[rgba(255,255,255,0.2)]"></div>
    </div>
  );
}

export function PlayoffBracket() {
  const [data, setData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  const fetchAllGames = useCallback(async () => {
    try {
      setLoading(true);
      const weeks = [1, 2, 3, 5];
      const allGames: BracketGame[] = [];

      for (const week of weeks) {
        const response = await fetch(`/api/games?year=${CURRENT_SEASON_YEAR}&week=${week}`);
        if (!response.ok) continue;
        const result = await response.json();

        // Add conference info to each game
        const gamesWithConf = result.games.map((g: BracketGame) => ({
          ...g,
          conference: getConference(g.awayTeam.abbreviation, g.homeTeam.abbreviation),
        }));
        allGames.push(...gamesWithConf);
      }

      // Get eliminated teams from the last response
      const lastResponse = await fetch(`/api/games?year=${CURRENT_SEASON_YEAR}&week=1`);
      const lastResult = await lastResponse.json();

      setData({
        games: allGames,
        eliminatedTeams: lastResult.eliminatedTeams || [],
        lastUpdated: new Date().toISOString(),
      });
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAllGames();
  }, [fetchAllGames]);

  // Auto-refresh every 60 seconds during live games (without page reload)
  useEffect(() => {
    const hasLiveGames = data?.games.some((g) => g.status.state === "in");
    if (!hasLiveGames) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchAllGames();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [data, fetchAllGames]);

  if (loading) {
    return (
      <div className="text-center py-12 text-[var(--chalk-muted)]">Loading playoff bracket...</div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/30 p-4 rounded-lg text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  // Group games by week and conference
  const wildCard = data.games.filter((g) => g.week === 1);
  const divisional = data.games.filter((g) => g.week === 2);
  const conference = data.games.filter((g) => g.week === 3);
  const superBowl = data.games.filter((g) => g.week === 5);

  const afcWildCard = wildCard.filter((g) => g.conference === "AFC");
  const nfcWildCard = wildCard.filter((g) => g.conference === "NFC");
  const afcDivisional = divisional.filter((g) => g.conference === "AFC");
  const nfcDivisional = divisional.filter((g) => g.conference === "NFC");
  const afcChampionship = conference.filter((g) => g.conference === "AFC");
  const nfcChampionship = conference.filter((g) => g.conference === "NFC");

  return (
    <div className="space-y-8">
      {/* Desktop Bracket Layout */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="min-w-[1100px] p-4">
          {/* Column Headers */}
          <div className="grid grid-cols-7 gap-4 mb-6 text-center">
            <div className="text-sm font-bold text-[var(--chalk-blue)]">Wild Card</div>
            <div></div>
            <div className="text-sm font-bold text-[var(--chalk-blue)]">Divisional</div>
            <div></div>
            <div className="text-sm font-bold text-[var(--chalk-blue)]">Conference</div>
            <div></div>
            <div className="text-sm font-bold text-[var(--chalk-yellow)]">Super Bowl</div>
          </div>

          {/* AFC Side */}
          <div className="mb-6">
            <div className="text-xs font-bold text-red-400 mb-3 uppercase tracking-wider">AFC</div>
            <div className="grid grid-cols-7 gap-4 items-center">
              {/* Wild Card */}
              <div className="space-y-3">
                {afcWildCard.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>

              <ConnectorLine direction="right" />

              {/* Divisional */}
              <div className="space-y-3">
                {afcDivisional.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>

              <ConnectorLine direction="right" />

              {/* Conference */}
              <div className="space-y-3">
                {afcChampionship.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
                {afcChampionship.length === 0 && (
                  <div className="min-w-[140px] p-4 rounded-lg border-2 border-dashed border-[rgba(255,255,255,0.1)] text-center text-[var(--chalk-muted)] text-xs">
                    TBD
                  </div>
                )}
              </div>

              <ConnectorLine direction="right" />

              {/* Super Bowl (spans both conferences) */}
              <div className="row-span-2 flex items-center justify-center">
                {superBowl.length > 0 ? (
                  <BracketGameCard
                    game={superBowl[0]}
                    eliminatedTeams={data.eliminatedTeams}
                    size="large"
                  />
                ) : (
                  <div className="min-w-[180px] p-6 rounded-lg border-2 border-dashed border-[var(--chalk-yellow)] text-center">
                    <div className="text-[var(--chalk-yellow)] text-sm font-bold mb-1">
                      Super Bowl
                    </div>
                    <div className="text-[var(--chalk-muted)] text-xs">TBD</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* NFC Side */}
          <div>
            <div className="text-xs font-bold text-blue-400 mb-3 uppercase tracking-wider">NFC</div>
            <div className="grid grid-cols-7 gap-4 items-center">
              {/* Wild Card */}
              <div className="space-y-3">
                {nfcWildCard.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>

              <ConnectorLine direction="right" />

              {/* Divisional */}
              <div className="space-y-3">
                {nfcDivisional.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>

              <ConnectorLine direction="right" />

              {/* Conference */}
              <div className="space-y-3">
                {nfcChampionship.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
                {nfcChampionship.length === 0 && (
                  <div className="min-w-[140px] p-4 rounded-lg border-2 border-dashed border-[rgba(255,255,255,0.1)] text-center text-[var(--chalk-muted)] text-xs">
                    TBD
                  </div>
                )}
              </div>

              {/* Empty columns for Super Bowl alignment */}
              <div></div>
              <div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Week by Week */}
      <div className="lg:hidden space-y-4 sm:space-y-6">
        {/* Wild Card */}
        <div className="chalk-box p-3 sm:p-4">
          <h3 className="text-lg font-bold text-[var(--chalk-blue)] mb-4">Wild Card Round</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold text-red-400 mb-2">AFC</div>
              <div className="space-y-2">
                {afcWildCard.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-blue-400 mb-2">NFC</div>
              <div className="space-y-2">
                {nfcWildCard.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Divisional */}
        <div className="chalk-box p-3 sm:p-4">
          <h3 className="text-lg font-bold text-[var(--chalk-blue)] mb-4">Divisional Round</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <div className="text-xs font-bold text-red-400 mb-2">AFC</div>
              <div className="space-y-2">
                {afcDivisional.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-blue-400 mb-2">NFC</div>
              <div className="space-y-2">
                {nfcDivisional.map((game) => (
                  <BracketGameCard
                    key={game.eventId}
                    game={game}
                    eliminatedTeams={data.eliminatedTeams}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Conference Championships */}
        <div className="chalk-box p-3 sm:p-4">
          <h3 className="text-lg font-bold text-[var(--chalk-blue)] mb-4">
            Conference Championships
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <div className="text-xs font-bold text-red-400 mb-2">AFC Championship</div>
              {afcChampionship.length > 0 ? (
                <BracketGameCard game={afcChampionship[0]} eliminatedTeams={data.eliminatedTeams} />
              ) : (
                <div className="p-4 rounded-lg border-2 border-dashed border-[rgba(255,255,255,0.1)] text-center text-[var(--chalk-muted)] text-sm">
                  TBD
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-blue-400 mb-2">NFC Championship</div>
              {nfcChampionship.length > 0 ? (
                <BracketGameCard game={nfcChampionship[0]} eliminatedTeams={data.eliminatedTeams} />
              ) : (
                <div className="p-4 rounded-lg border-2 border-dashed border-[rgba(255,255,255,0.1)] text-center text-[var(--chalk-muted)] text-sm">
                  TBD
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Super Bowl */}
        <div className="chalk-box p-3 sm:p-4 border-2 border-[var(--chalk-yellow)]">
          <h3 className="text-lg font-bold text-[var(--chalk-yellow)] mb-4 text-center">
            Super Bowl
          </h3>
          {superBowl.length > 0 ? (
            <div className="max-w-xs mx-auto">
              <BracketGameCard
                game={superBowl[0]}
                eliminatedTeams={data.eliminatedTeams}
                size="large"
              />
            </div>
          ) : (
            <div className="max-w-xs mx-auto p-6 rounded-lg border-2 border-dashed border-[var(--chalk-yellow)] text-center">
              <div className="text-[var(--chalk-muted)] text-sm">TBD</div>
            </div>
          )}
        </div>
      </div>

      {/* Eliminated Teams */}
      {data.eliminatedTeams.length > 0 && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="text-xs text-red-400 font-medium mb-2">Eliminated Teams</div>
          <div className="text-sm text-[var(--chalk-muted)]">{data.eliminatedTeams.join(", ")}</div>
        </div>
      )}

      {/* Last Updated / Live Indicator */}
      {data.lastUpdated && (
        <div className="flex items-center justify-center gap-3 text-xs text-[var(--chalk-muted)]">
          {data.games.some((g) => g.status.state === "in") && (
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Live - refreshing in {countdown}s
            </span>
          )}
          <span>Updated: {new Date(data.lastUpdated).toLocaleTimeString()}</span>
          <button
            onClick={() => fetchAllGames()}
            className="text-[var(--chalk-blue)] hover:underline"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
