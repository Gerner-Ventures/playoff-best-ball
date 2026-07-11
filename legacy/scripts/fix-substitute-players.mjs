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

// Substitute players to fix
const playersToFix = [
  { name: "Jarret Stidham", espnId: "3892775", team: "DEN", correctName: "Jarrett Stidham" },
  { name: "Colby Parkinson", espnId: "4242557", team: "LAR" },
];

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN MODE (use --execute to apply) ===\n' : '\n=== EXECUTING FIXES ===\n');

  for (const fix of playersToFix) {
    console.log(`Fixing: ${fix.name}`);

    // Find by name (case insensitive, partial match)
    const player = await prisma.player.findFirst({
      where: {
        name: { contains: fix.name.split(' ')[1], mode: 'insensitive' }
      }
    });

    if (!player) {
      // Try to create the player if not found
      console.log('  Player not found, checking if we need to create...');
      const existing = await prisma.player.findFirst({
        where: { espnId: fix.espnId }
      });

      if (existing) {
        console.log('  Found existing player with this ESPN ID:', existing.name);
        continue;
      }

      if (!DRY_RUN) {
        const newPlayer = await prisma.player.create({
          data: {
            name: fix.correctName || fix.name,
            espnId: fix.espnId,
            team: fix.team,
            position: fix.name.includes('Stidham') ? 'QB' : 'TE'
          }
        });
        console.log('  Created player:', newPlayer.name, 'with ESPN ID:', fix.espnId);
      } else {
        console.log('  Would create player:', fix.correctName || fix.name);
      }
      continue;
    }

    console.log('  Found:', player.name, '(ID:', player.id, ')');
    console.log('  Current ESPN ID:', player.espnId || 'NONE');
    console.log('  Current Team:', player.team || 'NONE');

    const updates = {};
    if (!player.espnId && fix.espnId) {
      updates.espnId = fix.espnId;
    }
    if (fix.team && player.team !== fix.team) {
      updates.team = fix.team;
    }
    if (fix.correctName && player.name !== fix.correctName) {
      updates.name = fix.correctName;
    }

    if (Object.keys(updates).length > 0) {
      console.log('  Updates:', updates);
      if (!DRY_RUN) {
        await prisma.player.update({
          where: { id: player.id },
          data: updates
        });
        console.log('  DONE');
      }
    } else {
      console.log('  No updates needed');
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
