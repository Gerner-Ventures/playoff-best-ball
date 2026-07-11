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

// Players to check
const playersToCheck = [
  "Jason Myers",
  "Wil Lutz",
  "Troy Franklin",
  "Denver Broncos",
  "Seattle Seahawks"
];

async function main() {
  console.log('\n=== CHECKING PLAYER SCORES ===\n');

  for (const name of playersToCheck) {
    const player = await prisma.player.findFirst({
      where: { name },
      include: {
        scores: { orderBy: { week: 'asc' } },
        rosters: { include: { owner: true } }
      }
    });

    if (!player) {
      console.log(`${name}: NOT FOUND`);
      continue;
    }

    console.log(`${name} (${player.position}, ${player.team})`);
    console.log(`  ESPN ID: ${player.espnId || 'NONE'}`);
    console.log(`  Owner: ${player.rosters.map(r => r.owner.name).join(', ')}`);

    if (player.scores.length > 0) {
      console.log(`  Scores:`);
      for (const score of player.scores) {
        const weekName = score.week === 1 ? 'Wild Card' : score.week === 2 ? 'Divisional' : score.week === 3 ? 'Conference' : 'Super Bowl';
        console.log(`    Week ${score.week} (${weekName}): ${score.points.toFixed(1)} pts`);
      }
    } else {
      console.log(`  Scores: NONE`);
    }
    console.log('');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
