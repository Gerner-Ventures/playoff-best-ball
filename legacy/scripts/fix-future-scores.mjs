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

  // Find all DST scores for Week 3 and Week 5 with -3 points (indicates no game data)
  const badScores = await prisma.playerScore.findMany({
    where: {
      week: { in: [3, 5] },
      points: -3,
    },
    include: {
      player: true
    }
  });

  console.log('Found', badScores.length, 'scores with -3 points for future weeks');

  for (const score of badScores) {
    console.log(`  ${score.player.name} (W${score.week}): ${score.points} pts`);
  }

  if (badScores.length > 0 && !DRY_RUN) {
    const deleted = await prisma.playerScore.deleteMany({
      where: {
        id: { in: badScores.map(s => s.id) }
      }
    });
    console.log('\nDeleted', deleted.count, 'erroneous scores');
  }

  if (DRY_RUN && badScores.length > 0) {
    console.log('\nRun with --execute to delete these scores');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
