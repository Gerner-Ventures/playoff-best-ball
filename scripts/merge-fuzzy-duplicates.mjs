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

// The fuzzy duplicates to merge
const toMerge = [
  {
    "rosteredId": "cmkai4ow90007ugoe7b34x8b4",
    "rosteredName": "AJ Brown",
    "unrosteredId": "cmkaijdyk007mwwoecfaablav",
    "unrosteredName": "A.J. Brown",
    "espnId": "4047646"
  },
  {
    "rosteredId": "cmkai4r5g001fugoeiueadvir",
    "rosteredName": "Brian Thomas Jr",
    "unrosteredId": "cmkaijbdj004gwwoem3h3v57f",
    "unrosteredName": "Brian Thomas Jr.",
    "espnId": "4432773"
  },
  {
    "rosteredId": "cmkai4qr70019ugoev40k5saf",
    "rosteredName": "Devonta Smith",
    "unrosteredId": "cmkaijdww007kwwoe1walai1v",
    "unrosteredName": "DeVonta Smith",
    "espnId": "4241478"
  },
  {
    "rosteredId": "cmkai4uny0032ugoe3g2n7pr4",
    "rosteredName": "Jake Elliot",
    "unrosteredId": "cmkaijesw008qwwoe9tk6kud1",
    "unrosteredName": "Jake Elliott",
    "espnId": "3050478"
  },
  {
    "rosteredId": "cmkai4pm7000mugoesxiqh2ot",
    "rosteredName": "James Cook",
    "unrosteredId": "cmkaij9rq002ewwoe6wo6juq4",
    "unrosteredName": "James Cook III",
    "espnId": "4379399"
  },
  {
    "rosteredId": "cmkai4sjq001yugoe80o2h7zf",
    "rosteredName": "Luther Burden",
    "unrosteredId": "cmkaijje100eqwwoebo3qwbr7",
    "unrosteredName": "Luther Burden III",
    "espnId": "4685278"
  },
  {
    "rosteredId": "cmkai4v0v0039ugoebm0910j4",
    "rosteredName": "Travis Etienne",
    "unrosteredId": "cmkaijb6m0048wwoexlrjz9pb",
    "unrosteredName": "Travis Etienne Jr.",
    "espnId": "4239996"
  }
];

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN MODE (use --execute to apply) ===\n' : '\n=== EXECUTING MERGES ===\n');

  let merged = 0;

  for (const item of toMerge) {
    console.log(`Merging: "${item.rosteredName}" <- "${item.unrosteredName}" (ESPN: ${item.espnId})`);

    // Verify both players exist
    const rostered = await prisma.player.findUnique({
      where: { id: item.rosteredId },
      include: { scores: true }
    });
    const unrostered = await prisma.player.findUnique({
      where: { id: item.unrosteredId },
      include: { scores: true }
    });

    if (!rostered) {
      console.log('  SKIP: Rostered player not found (already merged?)');
      continue;
    }
    if (!unrostered) {
      console.log('  SKIP: Unrostered player not found (already merged?)');
      continue;
    }
    if (rostered.espnId) {
      console.log('  SKIP: Rostered player already has ESPN ID:', rostered.espnId);
      continue;
    }

    console.log('  Rostered scores:', rostered.scores.length);
    console.log('  Unrostered scores:', unrostered.scores.length);

    if (!DRY_RUN) {
      // Clear ESPN ID from unrostered first
      await prisma.player.update({
        where: { id: item.unrosteredId },
        data: { espnId: null }
      });

      // Transfer scores that rostered doesn't have
      for (const score of unrostered.scores) {
        const existing = rostered.scores.find(s => s.week === score.week && s.year === score.year);
        if (!existing) {
          await prisma.playerScore.update({
            where: { id: score.id },
            data: { playerId: item.rosteredId }
          });
          console.log('  Transferred score for week', score.week);
        }
      }

      // Delete unrostered player's remaining scores and the player
      await prisma.playerScore.deleteMany({
        where: { playerId: item.unrosteredId }
      });
      await prisma.player.delete({
        where: { id: item.unrosteredId }
      });

      // Update rostered player with ESPN ID
      await prisma.player.update({
        where: { id: item.rosteredId },
        data: { espnId: item.espnId }
      });

      console.log('  DONE');
    }

    merged++;
  }

  console.log('\n=== SUMMARY ===');
  console.log('Merged:', merged);

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
