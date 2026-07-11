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

// Name corrections (wrong name -> correct name)
const nameCorrections = [
  { wrongName: "Jason Meyers", correctName: "Jason Myers" },
  { wrongName: "Will Lutz", correctName: "Wil Lutz" },
];

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN MODE (use --execute to apply) ===\n' : '\n=== EXECUTING NAME FIXES ===\n');

  let fixed = 0;

  for (const correction of nameCorrections) {
    console.log(`Checking: "${correction.wrongName}" -> "${correction.correctName}"`);

    const player = await prisma.player.findFirst({
      where: { name: correction.wrongName },
      include: { rosters: { include: { owner: true } } }
    });

    if (!player) {
      console.log('  SKIP: Player not found');
      continue;
    }

    console.log('  Found player:');
    console.log('    ID:', player.id);
    console.log('    Team:', player.team);
    console.log('    Position:', player.position);
    console.log('    Owner:', player.rosters.map(r => r.owner.name).join(', '));

    // Check if correct name already exists
    const existing = await prisma.player.findFirst({
      where: { name: correction.correctName }
    });

    if (existing) {
      console.log('  WARNING: Player with correct name already exists:');
      console.log('    ID:', existing.id);
      console.log('    ESPN ID:', existing.espnId);
      console.log('  Consider merging instead of renaming.');
      continue;
    }

    if (!DRY_RUN) {
      await prisma.player.update({
        where: { id: player.id },
        data: { name: correction.correctName }
      });
      console.log('  DONE: Name updated');
    }

    fixed++;
  }

  console.log('\n=== SUMMARY ===');
  console.log('Fixed:', fixed);

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
