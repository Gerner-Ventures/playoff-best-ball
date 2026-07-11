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

async function main() {
  const rosteredNoEspn = await prisma.player.findMany({
    where: {
      espnId: null,
      rosters: { some: {} }
    },
    include: {
      rosters: { include: { owner: true } },
      scores: true,
    },
    orderBy: { name: 'asc' }
  });

  console.log('\n=== ROSTERED PLAYERS WITHOUT ESPN ID ===\n');
  console.log('Total:', rosteredNoEspn.length, '\n');

  for (const player of rosteredNoEspn) {
    console.log('Name:', player.name);
    console.log('  ID:', player.id);
    console.log('  Position:', player.position);
    console.log('  Team:', player.team);
    console.log('  Owner:', player.rosters.map(r => r.owner.name).join(', '));
    console.log('  Scores:', player.scores.length, player.scores.length > 0 ? `(weeks: ${player.scores.map(s => s.week).join(', ')})` : '');
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
