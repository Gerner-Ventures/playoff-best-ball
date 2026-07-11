import prisma from "@/lib/db";
import { RosterCard } from "@/components/roster-card";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

// Placeholder data matching your spreadsheet
const PLACEHOLDER_ROSTERS = [
  {
    owner: "JC",
    roster: [
      { slot: "QB", name: "Matthew Stafford", points: 26.1 },
      { slot: "RB1", name: "TreVeyon Henderson", points: 0 },
      { slot: "RB2", name: "Woody Marks", points: 0 },
      { slot: "WR1", name: "AJ Brown", points: 4 },
      { slot: "WR2", name: "Kayshon Boutte", points: 0 },
      { slot: "TE", name: "George Kittle", points: 1.1 },
      { slot: "FLEX", name: "Rome Odunze", points: 5.4 },
      { slot: "K", name: "Cairo Santos", points: 13 },
      { slot: "DST", name: "Houston Texans", points: 0 },
    ],
  },
  {
    owner: "Brad",
    roster: [
      { slot: "QB", name: "Caleb Williams", points: 24 },
      { slot: "RB1", name: "James Cook", points: 6.1 },
      { slot: "RB2", name: "Rhamondre Stevenson", points: 0 },
      { slot: "WR1", name: "Puka Nacua", points: 29.5 },
      { slot: "WR2", name: "Jakobi Meyers", points: 1.7 },
      { slot: "TE", name: "Dalton Schultz", points: 0 },
      { slot: "FLEX", name: "Blake Corum", points: 6.8 },
      { slot: "K", name: "Harrison Mevis", points: 12 },
      { slot: "DST", name: "Los Angeles Rams", points: 5 },
    ],
  },
  {
    owner: "Johnny",
    roster: [
      { slot: "QB", name: "Drake Maye", points: 0 },
      { slot: "RB1", name: "D'Andre Swift", points: 16.2 },
      { slot: "RB2", name: "Jaylen Warren", points: 0 },
      { slot: "WR1", name: "Devonta Smith", points: 11 },
      { slot: "WR2", name: "Troy Franklin", points: 0 },
      { slot: "TE", name: "Dalton Kincaid", points: 10.3 },
      { slot: "FLEX", name: "Brian Thomas Jr", points: 9.1 },
      { slot: "K", name: "Jason Meyers", points: 0 },
      { slot: "DST", name: "New England Patriots", points: 10 },
    ],
  },
  {
    owner: "Ben",
    roster: [
      { slot: "QB", name: "Jalen Hurts", points: 13 },
      { slot: "RB1", name: "Zach Charbonnet", points: 0 },
      { slot: "RB2", name: "Kenny Gainwell", points: 0 },
      { slot: "WR1", name: "Jaxon Smith-Njigba", points: 0 },
      { slot: "WR2", name: "Stefon Diggs", points: 0 },
      { slot: "TE", name: "AJ Barner", points: 0 },
      { slot: "FLEX", name: "Luther Burden", points: 5.3 },
      { slot: "K", name: "Andy Borregales", points: 0 },
      { slot: "DST", name: "Jacksonville Jaguars", points: 3 },
    ],
  },
  {
    owner: "Nick",
    roster: [
      { slot: "QB", name: "Bo Nix", points: 0 },
      { slot: "RB1", name: "Kenneth Walker", points: 0 },
      { slot: "RB2", name: "Christian McCaffrey", points: 26.4 },
      { slot: "WR1", name: "Nico Collins", points: 0 },
      { slot: "WR2", name: "DJ Moore", points: 14.9 },
      { slot: "TE", name: "Brenton Strange", points: 1.9 },
      { slot: "FLEX", name: "Omarion Hampton", points: 0 },
      { slot: "K", name: "Cam Little", points: 7 },
      { slot: "DST", name: "Buffalo Bills", points: 5 },
    ],
  },
  {
    owner: "Jon",
    roster: [
      { slot: "QB", name: "Josh Allen", points: 30.4 },
      { slot: "RB1", name: "Saquon Barkley", points: 14.6 },
      { slot: "RB2", name: "RJ Harvey", points: 0 },
      { slot: "WR1", name: "Khalil Shakir", points: 14.2 },
      { slot: "WR2", name: "Jayden Higgins", points: 0 },
      { slot: "TE", name: "Dallas Goedert", points: 17.4 },
      { slot: "FLEX", name: "Colston Loveland", points: 19.7 },
      { slot: "K", name: "Jake Elliot", points: 7 },
      { slot: "DST", name: "Philadelphia Eagles", points: 5 },
    ],
  },
  {
    owner: "Eli",
    roster: [
      { slot: "QB", name: "Sam Darnold", points: 0 },
      { slot: "RB1", name: "Travis Etienne", points: 20.1 },
      { slot: "RB2", name: "Kyle Monangai", points: 5.4 },
      { slot: "WR1", name: "Davante Adams", points: 9.7 },
      { slot: "WR2", name: "Courtland Sutton", points: 0 },
      { slot: "TE", name: "Hunter Henry", points: 0 },
      { slot: "FLEX", name: "DK Metcalf", points: 0 },
      { slot: "K", name: "Will Lutz", points: 0 },
      { slot: "DST", name: "Denver Broncos", points: 0 },
    ],
  },
  {
    owner: "Sam",
    roster: [
      { slot: "QB", name: "Trevor Lawrence", points: 24 },
      { slot: "RB1", name: "Kyren Williams", points: 16.5 },
      { slot: "RB2", name: "Josh Jacobs", points: 6.3 },
      { slot: "WR1", name: "Parker Washington", points: 20.4 },
      { slot: "WR2", name: "Christian Watson", points: 11.1 },
      { slot: "TE", name: "Tyler Higbee", points: 5.5 },
      { slot: "FLEX", name: "Pat Bryant", points: 0 },
      { slot: "K", name: "Ka'imi Fairbairn", points: 0 },
      { slot: "DST", name: "Seattle Seahawks", points: 0 },
    ],
  },
];

// Determine current week based on eliminated teams count
function getCurrentWeek(eliminatedCount: number): number {
  if (eliminatedCount < 6) {
    return 1; // Wild Card
  } else if (eliminatedCount < 10) {
    return 2; // Divisional
  } else if (eliminatedCount < 12) {
    return 3; // Conference Championship
  } else {
    return 5; // Super Bowl
  }
}

async function getRosterData(currentWeek: number) {
  try {
    const owners = await prisma.owner.findMany({
      include: {
        rosters: {
          where: {
            year: CURRENT_SEASON_YEAR,
          },
          include: {
            player: {
              include: {
                scores: {
                  where: {
                    year: CURRENT_SEASON_YEAR,
                  },
                },
              },
            },
            substitutions: {
              where: {
                year: CURRENT_SEASON_YEAR,
              },
              include: {
                substitutePlayer: {
                  include: {
                    scores: {
                      where: {
                        year: CURRENT_SEASON_YEAR,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (owners.length === 0) {
      return PLACEHOLDER_ROSTERS;
    }

    return owners.map((owner) => ({
      owner: owner.name,
      roster: owner.rosters.map((r) => {
        const substitution = r.substitutions[0]; // Max one per roster per year
        const hasSubstitution = !!substitution;
        // Only show as "injured" if we're at or past the effective week
        const isSubstitutionActive = hasSubstitution && currentWeek >= substitution.effectiveWeek;

        // Calculate points with substitution logic
        let points: number;
        if (hasSubstitution) {
          // Original player's points before effective week
          const originalPointsBefore = r.player.scores
            .filter((s) => s.week < substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);

          // Substitute's points from effective week onwards
          const substitutePointsAfter = substitution.substitutePlayer.scores
            .filter((s) => s.week >= substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);

          points = originalPointsBefore + substitutePointsAfter;
        } else {
          points = r.player.scores.reduce((sum, s) => sum + s.points, 0);
        }

        // Use substitute's team for elimination check if substitution is active
        const activeTeam =
          isSubstitutionActive && substitution ? substitution.substitutePlayer.team : r.player.team;

        return {
          slot: r.rosterSlot,
          name: r.player.name,
          points,
          playerId: r.player.id,
          team: r.player.team,
          // The team that should be checked for elimination (substitute's team if active)
          activeTeam,
          // Substitution data for display - only mark as having substitution if active
          hasSubstitution: isSubstitutionActive,
          substitution: hasSubstitution
            ? {
                effectiveWeek: substitution.effectiveWeek,
                reason: substitution.reason,
                substitutePlayer: {
                  id: substitution.substitutePlayer.id,
                  name: substitution.substitutePlayer.name,
                  team: substitution.substitutePlayer.team,
                },
              }
            : null,
        };
      }),
    }));
  } catch (error) {
    console.error("Error fetching rosters:", error);
    return PLACEHOLDER_ROSTERS;
  }
}

export default async function RostersPage() {
  // Get eliminated teams first to determine current week
  const eliminatedTeams = await getEliminatedTeams();
  const currentWeek = getCurrentWeek(eliminatedTeams.size);

  // Then get roster data with currentWeek context
  const rosters = await getRosterData(currentWeek);

  // Get prop coverage statistics
  const propCoverage = await prisma.playerProp.groupBy({
    by: ["playerId"],
    where: { year: CURRENT_SEASON_YEAR },
  });
  const playersWithProps = new Set(propCoverage.map((p) => p.playerId));

  // Count rostered players with props
  let totalRosteredPlayers = 0;
  let playersWithPropData = 0;
  for (const r of rosters) {
    for (const p of r.roster) {
      totalRosteredPlayers++;
      if ("playerId" in p && playersWithProps.has(p.playerId as string)) {
        playersWithPropData++;
      }
    }
  }
  const propCoveragePercent =
    totalRosteredPlayers > 0 ? Math.round((playersWithPropData / totalRosteredPlayers) * 100) : 0;

  // Calculate totals and active players, sort by total points
  const rostersWithTotals = rosters
    .map((r) => {
      let activePlayers = 0;
      let unknownPlayers = 0;
      let eliminatedPlayers = 0;

      for (const p of r.roster) {
        // Use activeTeam (substitute's team if substitution active) for elimination check
        const team =
          "activeTeam" in p
            ? (p.activeTeam as string | null | undefined)
            : "team" in p
              ? (p.team as string | null | undefined)
              : null;
        if (!team) {
          unknownPlayers++;
          activePlayers++; // Count unknown as active for now
        } else if (eliminatedTeams.has(team.toUpperCase())) {
          eliminatedPlayers++;
        } else {
          activePlayers++;
        }
      }

      return {
        ...r,
        totalPoints: r.roster.reduce((sum, p) => sum + p.points, 0),
        activePlayers,
        unknownPlayers,
        eliminatedPlayers,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const eliminatedArray = Array.from(eliminatedTeams);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[var(--chalk-yellow)] chalk-text">All Rosters</h1>
        <p className="text-sm text-[var(--chalk-muted)]">
          Click any player to view scoring breakdown
        </p>
      </div>

      {/* Eliminated Teams Banner */}
      {eliminatedArray.length > 0 && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          <div className="text-xs text-red-400 font-medium mb-1">Eliminated Teams</div>
          <div className="text-sm text-[var(--chalk-muted)]">{eliminatedArray.join(", ")}</div>
        </div>
      )}

      {/* Prop Coverage Banner */}
      {propCoveragePercent > 0 && (
        <div className="bg-[var(--chalk-blue)]/10 border border-[var(--chalk-blue)]/30 rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--chalk-blue)] font-medium mb-1">
              Betting Prop Coverage
            </div>
            <div className="text-sm text-[var(--chalk-muted)]">
              {playersWithPropData} of {totalRosteredPlayers} rostered players have betting props
              available
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-[var(--chalk-blue)]">
              {propCoveragePercent}%
            </div>
            <div className="text-[10px] text-[var(--chalk-muted)]">coverage</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {rostersWithTotals.map((roster, index) => (
          <RosterCard
            key={roster.owner}
            ownerName={roster.owner}
            roster={roster.roster}
            totalPoints={roster.totalPoints}
            rank={index + 1}
            compact={true}
            eliminatedTeams={eliminatedArray}
            activePlayers={roster.activePlayers}
            unknownPlayers={roster.unknownPlayers}
          />
        ))}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
