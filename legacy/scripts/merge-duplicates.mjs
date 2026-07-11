import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: '.env.local' });

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set!");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN MODE (use --execute to apply changes) ===\n' : '\n=== EXECUTING CHANGES ===\n');

  // Get all players with their rosters and scores
  const allPlayers = await prisma.player.findMany({
    include: {
      rosters: { include: { owner: true } },
      scores: true,
    },
    orderBy: { name: 'asc' }
  });

  // Group by name
  const byName = {};
  allPlayers.forEach(p => {
    if (!byName[p.name]) byName[p.name] = [];
    byName[p.name].push(p);
  });

  // Find duplicates
  const duplicates = Object.entries(byName).filter(([name, players]) => players.length > 1);

  console.log('Found', duplicates.length, 'duplicate player names\n');

  let mergedCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;

  for (const [name, players] of duplicates) {
    console.log('---', name, '---');

    // Find the rostered player and the one with ESPN ID
    const rostered = players.filter(p => p.rosters.length > 0);
    const withEspnId = players.filter(p => p.espnId);
    const unrostered = players.filter(p => p.rosters.length === 0);

    // Describe current state
    players.forEach(p => {
      console.log('  ID:', p.id);
      console.log('    ESPN ID:', p.espnId || 'NONE');
      console.log('    Team:', p.team || 'NONE');
      console.log('    Rostered:', p.rosters.length > 0 ? p.rosters.map(r => r.owner.name).join(', ') : 'NO');
      console.log('    Scores:', p.scores.length);
    });

    // Determine merge strategy
    if (rostered.length === 1 && unrostered.length === 1) {
      const rosteredPlayer = rostered[0];
      const unrosteredPlayer = unrostered[0];

      // Check if we can get ESPN ID from the unrostered one
      if (unrosteredPlayer.espnId && !rosteredPlayer.espnId) {
        const espnIdToTransfer = unrosteredPlayer.espnId;
        console.log('\n  ACTION: Transfer ESPN ID', espnIdToTransfer, 'to rostered player');
        console.log('          Then delete unrostered player', unrosteredPlayer.id);

        if (!DRY_RUN) {
          // First, clear the ESPN ID from unrostered player (to avoid unique constraint)
          await prisma.player.update({
            where: { id: unrosteredPlayer.id },
            data: { espnId: null }
          });

          // Transfer any scores from unrostered to rostered (if rostered doesn't have them)
          for (const score of unrosteredPlayer.scores) {
            const existingScore = rosteredPlayer.scores.find(
              s => s.week === score.week && s.year === score.year
            );
            if (!existingScore) {
              await prisma.playerScore.update({
                where: { id: score.id },
                data: { playerId: rosteredPlayer.id }
              });
              console.log('          Transferred score for week', score.week);
            }
          }

          // Delete the unrostered player
          await prisma.playerScore.deleteMany({
            where: { playerId: unrosteredPlayer.id }
          });
          await prisma.player.delete({
            where: { id: unrosteredPlayer.id }
          });

          // Now transfer ESPN ID to rostered player
          await prisma.player.update({
            where: { id: rosteredPlayer.id },
            data: { espnId: espnIdToTransfer }
          });

          console.log('          DONE');
        }

        mergedCount++;
        deletedCount++;
      } else if (rosteredPlayer.espnId && !unrosteredPlayer.espnId) {
        // Rostered already has ESPN ID, just delete unrostered
        console.log('\n  ACTION: Delete unrostered player (rostered already has ESPN ID)');

        if (!DRY_RUN) {
          await prisma.playerScore.deleteMany({
            where: { playerId: unrosteredPlayer.id }
          });
          await prisma.player.delete({
            where: { id: unrosteredPlayer.id }
          });
          console.log('          DONE');
        }

        deletedCount++;
      } else if (rosteredPlayer.espnId === unrosteredPlayer.espnId) {
        // Both have same ESPN ID (or both null), delete unrostered
        console.log('\n  ACTION: Delete unrostered player (duplicate)');

        if (!DRY_RUN) {
          await prisma.playerScore.deleteMany({
            where: { playerId: unrosteredPlayer.id }
          });
          await prisma.player.delete({
            where: { id: unrosteredPlayer.id }
          });
          console.log('          DONE');
        }

        deletedCount++;
      } else {
        console.log('\n  SKIP: Complex case - both have different ESPN IDs');
        skippedCount++;
      }
    } else if (rostered.length === 0 && unrostered.length > 1) {
      // Neither is rostered - keep the one with ESPN ID, delete others
      const withId = unrostered.filter(p => p.espnId);
      const withoutId = unrostered.filter(p => !p.espnId);

      if (withId.length === 1) {
        console.log('\n  ACTION: Delete', withoutId.length, 'unrostered duplicates without ESPN ID');

        if (!DRY_RUN) {
          for (const p of withoutId) {
            await prisma.playerScore.deleteMany({
              where: { playerId: p.id }
            });
            await prisma.player.delete({
              where: { id: p.id }
            });
          }
          console.log('          DONE');
        }

        deletedCount += withoutId.length;
      } else {
        console.log('\n  SKIP: Multiple unrostered players, unclear which to keep');
        skippedCount++;
      }
    } else if (rostered.length > 1) {
      console.log('\n  SKIP: Multiple rostered players - requires manual review');
      skippedCount++;
    } else {
      console.log('\n  SKIP: Unexpected case');
      skippedCount++;
    }

    console.log('');
  }

  console.log('\n=== SUMMARY ===');
  console.log('Merged:', mergedCount);
  console.log('Deleted:', deletedCount);
  console.log('Skipped:', skippedCount);

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. Run with --execute to apply changes.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
