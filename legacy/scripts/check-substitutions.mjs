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
  console.log('\n=== CHECKING SUBSTITUTIONS ===\n');

  const subs = await prisma.substitution.findMany({
    include: {
      roster: {
        include: {
          owner: true,
          player: true
        }
      },
      originalPlayer: {
        include: {
          scores: true
        }
      },
      substitutePlayer: {
        include: {
          scores: true
        }
      }
    }
  });

  console.log('Total substitutions:', subs.length, '\n');

  for (const sub of subs) {
    console.log('---');
    console.log('Owner:', sub.roster.owner.name);
    console.log('Roster Slot:', sub.roster.rosterSlot);
    console.log('');
    console.log('Original Player:', sub.originalPlayer.name);
    console.log('  ESPN ID:', sub.originalPlayer.espnId || 'NONE');
    console.log('  Team:', sub.originalPlayer.team);
    console.log('  Scores:', sub.originalPlayer.scores.map(s => `W${s.week}: ${s.points}`).join(', ') || 'NONE');
    console.log('');
    console.log('Substitute Player:', sub.substitutePlayer.name);
    console.log('  ESPN ID:', sub.substitutePlayer.espnId || 'NONE');
    console.log('  Team:', sub.substitutePlayer.team);
    console.log('  Scores:', sub.substitutePlayer.scores.map(s => `W${s.week}: ${s.points}`).join(', ') || 'NONE');
    console.log('');
    console.log('Effective Week:', sub.effectiveWeek);
    console.log('Reason:', sub.reason || 'N/A');

    // Calculate expected points
    const originalPointsBefore = sub.originalPlayer.scores
      .filter(s => s.week < sub.effectiveWeek)
      .reduce((sum, s) => sum + s.points, 0);
    const subPointsAfter = sub.substitutePlayer.scores
      .filter(s => s.week >= sub.effectiveWeek)
      .reduce((sum, s) => sum + s.points, 0);

    console.log('');
    console.log('Points Calculation:');
    console.log('  Original (before week', sub.effectiveWeek + '):', originalPointsBefore.toFixed(1));
    console.log('  Substitute (week', sub.effectiveWeek, '+):', subPointsAfter.toFixed(1));
    console.log('  Combined:', (originalPointsBefore + subPointsAfter).toFixed(1));
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
