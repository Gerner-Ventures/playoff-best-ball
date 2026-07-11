import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set!");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN MODE ===\n' : '\n=== EXECUTING ===\n');

  // The substitute player (used in substitution)
  const subPlayer = await prisma.player.findUnique({
    where: { id: 'cmkltcflp00gqd4ssq3tt9u7y' },
    include: { substitutionsAsSubstitute: true }
  });

  // The ESPN synced player (has ESPN ID)
  const espnPlayer = await prisma.player.findUnique({
    where: { id: 'cmkaijf5c0096wwoejgmh0im1' },
    include: { scores: true }
  });

  console.log('Substitute record:', subPlayer?.name, '- ID:', subPlayer?.id);
  console.log('  ESPN ID:', subPlayer?.espnId || 'NONE');
  console.log('  Used in substitutions:', subPlayer?.substitutionsAsSubstitute.length);
  console.log('');
  console.log('ESPN record:', espnPlayer?.name, '- ID:', espnPlayer?.id);
  console.log('  ESPN ID:', espnPlayer?.espnId);
  console.log('  Scores:', espnPlayer?.scores.length);
  console.log('');

  if (!subPlayer || !espnPlayer) {
    console.log('One or both players not found');
    return;
  }

  console.log('Plan:');
  console.log('1. Clear ESPN ID from ESPN record');
  console.log('2. Transfer scores from ESPN record to substitute record');
  console.log('3. Update substitute record with ESPN ID, correct team, and position');
  console.log('4. Delete ESPN record');

  if (!DRY_RUN) {
    // 1. Clear ESPN ID from old record
    await prisma.player.update({
      where: { id: espnPlayer.id },
      data: { espnId: null }
    });

    // 2. Transfer scores
    for (const score of espnPlayer.scores) {
      await prisma.playerScore.update({
        where: { id: score.id },
        data: { playerId: subPlayer.id }
      });
      console.log('Transferred score for week', score.week);
    }

    // 3. Update substitute with ESPN ID and correct data
    await prisma.player.update({
      where: { id: subPlayer.id },
      data: {
        espnId: '4242557',
        team: 'LAR',
        position: 'TE'
      }
    });

    // 4. Delete the old ESPN record
    await prisma.player.delete({
      where: { id: espnPlayer.id }
    });

    console.log('\nDONE');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
