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

// Players to update with their ESPN IDs
const playersToUpdate = [
  { name: "Jason Myers", team: "SEA", position: "K", espnId: "2473037" },
  { name: "Wil Lutz", team: "DEN", position: "K", espnId: "2985659" },
  { name: "Troy Franklin", team: "DEN", position: "WR", espnId: "4431280" },
];

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN MODE (use --execute to apply) ===\n' : '\n=== EXECUTING ESPN ID UPDATES ===\n');

  let updated = 0;

  for (const data of playersToUpdate) {
    console.log(`Setting ESPN ID for "${data.name}" (${data.position}, ${data.team})`);

    // Find the player
    const player = await prisma.player.findFirst({
      where: {
        name: data.name,
        position: data.position,
        team: data.team
      },
      include: { rosters: { include: { owner: true } } }
    });

    if (!player) {
      console.log('  SKIP: Player not found');
      continue;
    }

    if (player.espnId) {
      console.log('  SKIP: Player already has ESPN ID:', player.espnId);
      continue;
    }

    console.log('  Found player:');
    console.log('    ID:', player.id);
    console.log('    Owner:', player.rosters.map(r => r.owner.name).join(', '));

    // Check if ESPN ID is already in use
    const existing = await prisma.player.findFirst({
      where: { espnId: data.espnId }
    });

    if (existing) {
      console.log('  SKIP: ESPN ID already in use by:', existing.name);
      continue;
    }

    if (!DRY_RUN) {
      await prisma.player.update({
        where: { id: player.id },
        data: { espnId: data.espnId }
      });
      console.log('  DONE: ESPN ID set to', data.espnId);
    } else {
      console.log('  Would set ESPN ID to', data.espnId);
    }

    updated++;
  }

  console.log('\n=== SUMMARY ===');
  console.log('Updated:', updated);

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
