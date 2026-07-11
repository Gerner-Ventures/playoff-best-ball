import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  fetchAllPlayoffStats,
  parsePlayerStats,
  parseDefenseStats,
  calculateTotalPoints,
} from "@/lib/espn";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for this endpoint

/**
 * POST /api/sync
 * Sync scores from ESPN to the database
 * Body:
 *   - year: number (default: current season year)
 *   - weeks: number[] (default: [1, 2, 3, 5])
 *   - includeIncomplete: boolean (default: false) - whether to include games that haven't finished
 */
export async function POST(request: Request) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[SYNC] ${msg}`);
    logs.push(msg);
  };

  try {
    const body = await request.json().catch(() => ({}));
    const year = body.year ?? CURRENT_SEASON_YEAR;
    const weeks: number[] = body.weeks ?? [1, 2, 3, 5];
    const includeIncomplete = body.includeIncomplete ?? false;

    log(
      `Starting sync for year=${year}, weeks=${JSON.stringify(weeks)}, includeIncomplete=${includeIncomplete}`
    );

    const results = {
      playersUpdated: 0,
      scoresCreated: 0,
      scoresUpdated: 0,
      errors: [] as string[],
      gamesFound: 0,
      gamesProcessed: 0,
      gamesSkipped: 0,
      playersFromEspn: [] as string[],
      defensesFromEspn: [] as string[],
      matchedPlayers: [] as string[],
      unmatchedPlayers: [] as string[],
      matchedByEspnId: [] as string[],
      matchedByName: [] as string[],
    };

    // Get all players from our database for matching
    const dbPlayers = await prisma.player.findMany({
      include: {
        rosters: {
          where: { year },
        },
        // Also include substitution relations to track substitute players
        substitutionsAsSubstitute: {
          where: { year },
        },
      },
    });
    log(`Found ${dbPlayers.length} players in database`);
    log(
      `DB Players: ${dbPlayers.map((p) => `${p.name} (${p.position})${p.espnId ? ` [ESPN:${p.espnId}]` : ""}`).join(", ")}`
    );

    // Build ESPN ID lookup map for faster matching
    const dbPlayersByEspnId = new Map<string, (typeof dbPlayers)[0]>();
    for (const player of dbPlayers) {
      if (player.espnId) {
        dbPlayersByEspnId.set(player.espnId, player);
      }
    }
    log(`${dbPlayersByEspnId.size} players have ESPN IDs for direct matching`);

    // Fetch all games from ESPN
    log(`Fetching games from ESPN for weeks: ${weeks.join(", ")}`);
    const allGames = await fetchAllPlayoffStats(weeks);
    results.gamesFound = allGames.length;
    log(`Fetched ${allGames.length} games from ESPN`);

    if (allGames.length === 0) {
      log("WARNING: No games returned from ESPN API");
    }

    // Process each game
    for (const { week, summary, isCompleted, isInProgress } of allGames) {
      const gameTitle = summary.header?.competitions?.[0]?.competitors
        ?.map((c) => c.team?.abbreviation)
        .join(" vs ");

      // Check if game should be processed
      const shouldProcess = isCompleted || isInProgress || includeIncomplete;
      if (!shouldProcess) {
        results.gamesSkipped++;
        log(`\nSKIPPING Week ${week} game: ${gameTitle || "Unknown"} (not started yet)`);
        continue;
      }

      results.gamesProcessed++;
      log(
        `\nProcessing Week ${week} game: ${gameTitle || "Unknown"} (completed=${isCompleted}, inProgress=${isInProgress})`
      );

      // Parse player stats
      const playerStats = parsePlayerStats(summary);
      calculateTotalPoints(playerStats);
      log(`Parsed ${playerStats.size} players from this game`);

      // Parse defense stats
      const defenseStats = parseDefenseStats(summary);
      log(`Parsed ${defenseStats.size} defense entries from this game`);

      // Log all players found in ESPN data
      for (const [key, player] of playerStats) {
        results.playersFromEspn.push(`${player.name} (${player.totalPoints.toFixed(1)} pts)`);
        log(`  ESPN Player: ${player.name} - ${player.totalPoints.toFixed(1)} pts`);
      }

      // Log all defenses found
      for (const [key, defense] of defenseStats) {
        if (key.includes("dst")) {
          results.defensesFromEspn.push(
            `${defense.teamName} (${defense.totalPoints.toFixed(1)} pts)`
          );
          log(`  ESPN Defense: ${defense.teamName} - ${defense.totalPoints.toFixed(1)} pts`);
        }
      }

      // Try to match ESPN players to our roster players
      for (const [espnKey, player] of playerStats) {
        // First try to match by ESPN ID (most reliable)
        let matchedDbPlayer = player.espnId ? dbPlayersByEspnId.get(player.espnId) : undefined;
        let matchedByEspnId = false;

        if (matchedDbPlayer) {
          matchedByEspnId = true;
          results.matchedByEspnId.push(`${player.name} [${player.espnId}]`);
        } else {
          // Fall back to name matching
          matchedDbPlayer = dbPlayers.find((dbp) => {
            const dbName = dbp.name.toLowerCase().trim();
            const espnName = player.name.toLowerCase().trim();
            return dbName === espnName || dbName.includes(espnName) || espnName.includes(dbName);
          });
          if (matchedDbPlayer) {
            results.matchedByName.push(`${player.name} -> ${matchedDbPlayer.name}`);
          }
        }

        // Player is relevant if they're rostered OR if they're a substitute player
        const isRostered = matchedDbPlayer && matchedDbPlayer.rosters.length > 0;
        const isSubstitute =
          matchedDbPlayer && matchedDbPlayer.substitutionsAsSubstitute.length > 0;

        if (matchedDbPlayer && (isRostered || isSubstitute)) {
          results.matchedPlayers.push(`${player.name} -> ${matchedDbPlayer.name}`);
          log(
            `  MATCHED${matchedByEspnId ? " (ESPN ID)" : " (name)"}${isSubstitute ? " (SUB)" : ""}: ${player.name} -> DB: ${matchedDbPlayer.name} (${matchedDbPlayer.id})`
          );

          try {
            // Update player team if we have it from ESPN
            const updates: { team?: string; espnId?: string } = {};

            if (player.team && player.team !== matchedDbPlayer.team) {
              updates.team = player.team;
            }

            // Auto-set ESPN ID if we matched by name and the DB player doesn't have one
            if (!matchedByEspnId && player.espnId && !matchedDbPlayer.espnId) {
              updates.espnId = player.espnId;
              // Update our lookup map for future matches in this sync
              dbPlayersByEspnId.set(player.espnId, matchedDbPlayer);
              log(`    Auto-set ESPN ID: ${player.espnId}`);
            }

            if (Object.keys(updates).length > 0) {
              await prisma.player.update({
                where: { id: matchedDbPlayer.id },
                data: updates,
              });
              if (updates.team) log(`    Updated team: ${updates.team}`);
            }

            // Upsert score for this week
            await prisma.playerScore.upsert({
              where: {
                playerId_week_year: {
                  playerId: matchedDbPlayer.id,
                  week,
                  year,
                },
              },
              create: {
                playerId: matchedDbPlayer.id,
                week,
                year,
                points: player.totalPoints,
                breakdown: player.stats,
              },
              update: {
                points: player.totalPoints,
                breakdown: player.stats,
              },
            });

            results.scoresUpdated++;
            log(`    Saved score: ${player.totalPoints.toFixed(1)} pts for week ${week}`);
          } catch (error) {
            const errMsg = `Failed to save score for ${player.name}: ${error instanceof Error ? error.message : "Unknown error"}`;
            results.errors.push(errMsg);
            log(`    ERROR: ${errMsg}`);
          }
        } else {
          results.unmatchedPlayers.push(player.name);
        }
      }

      // Match defense scores
      for (const [key, defense] of defenseStats) {
        if (!key.includes("dst")) continue;

        // Try different name formats for matching
        const possibleNames = [
          `${defense.teamName}`,
          `${defense.abbreviation} DST`,
          defense.teamName,
        ];

        const matchedDbPlayer = dbPlayers.find((dbp) => {
          const dbName = dbp.name.toLowerCase().trim();
          return possibleNames.some(
            (name) => dbName === name.toLowerCase() || dbName.includes(name.toLowerCase())
          );
        });

        if (matchedDbPlayer && matchedDbPlayer.rosters.length > 0) {
          results.matchedPlayers.push(`${defense.teamName} DST -> ${matchedDbPlayer.name}`);
          log(
            `  MATCHED DST: ${defense.teamName} -> DB: ${matchedDbPlayer.name} (${matchedDbPlayer.id})`
          );

          try {
            // Update DST team abbreviation if we have it
            if (defense.abbreviation && defense.abbreviation !== matchedDbPlayer.team) {
              await prisma.player.update({
                where: { id: matchedDbPlayer.id },
                data: { team: defense.abbreviation },
              });
              log(`    Updated DST team: ${defense.abbreviation}`);
            }

            await prisma.playerScore.upsert({
              where: {
                playerId_week_year: {
                  playerId: matchedDbPlayer.id,
                  week,
                  year,
                },
              },
              create: {
                playerId: matchedDbPlayer.id,
                week,
                year,
                points: defense.totalPoints,
                breakdown: defense.stats,
              },
              update: {
                points: defense.totalPoints,
                breakdown: defense.stats,
              },
            });

            results.scoresUpdated++;
            log(`    Saved DST score: ${defense.totalPoints.toFixed(1)} pts for week ${week}`);
          } catch (error) {
            const errMsg = `Failed to save DST score for ${defense.teamName}: ${error instanceof Error ? error.message : "Unknown error"}`;
            results.errors.push(errMsg);
            log(`    ERROR: ${errMsg}`);
          }
        } else {
          results.unmatchedPlayers.push(`${defense.teamName} DST`);
          log(`  UNMATCHED DST: ${defense.teamName} (tried: ${possibleNames.join(", ")})`);
        }
      }
    }

    log(`\n=== SYNC SUMMARY ===`);
    log(`Games found: ${results.gamesFound}`);
    log(`Games processed: ${results.gamesProcessed}`);
    log(`Games skipped (not started): ${results.gamesSkipped}`);
    log(`Players from ESPN: ${results.playersFromEspn.length}`);
    log(`Matched players: ${results.matchedPlayers.length}`);
    log(`  - By ESPN ID: ${results.matchedByEspnId.length}`);
    log(`  - By Name: ${results.matchedByName.length}`);
    log(`Unmatched players: ${results.unmatchedPlayers.length}`);
    log(`Scores updated: ${results.scoresUpdated}`);
    log(`Errors: ${results.errors.length}`);

    return NextResponse.json({
      success: true,
      data: results,
      logs,
      meta: {
        year,
        weeks,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    log(`FATAL ERROR: ${errMsg}`);
    console.error("Error syncing scores:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync scores",
        message: errMsg,
        logs,
      },
      { status: 500 }
    );
  }
}
