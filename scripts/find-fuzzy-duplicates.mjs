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

// Normalize name for comparison - remove suffixes, punctuation, extra spaces
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '') // Remove suffixes
    .replace(/[.']/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Check if two names are similar enough to be the same person
function areNamesSimilar(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match after normalization
  if (n1 === n2) return true;

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;

  return false;
}

async function main() {
  console.log('\n=== FINDING FUZZY DUPLICATES ===\n');

  const allPlayers = await prisma.player.findMany({
    include: {
      rosters: { include: { owner: true } },
      scores: true,
    },
    orderBy: { name: 'asc' }
  });

  // Separate rostered (without ESPN ID) and unrostered (with ESPN ID)
  const rosteredNoEspn = allPlayers.filter(p => p.rosters.length > 0 && !p.espnId);
  const unrosteredWithEspn = allPlayers.filter(p => p.rosters.length === 0 && p.espnId);

  console.log('Rostered players WITHOUT ESPN ID:', rosteredNoEspn.length);
  console.log('Unrostered players WITH ESPN ID:', unrosteredWithEspn.length);
  console.log('');

  const potentialMatches = [];

  // For each rostered player without ESPN ID, find potential matches
  for (const rostered of rosteredNoEspn) {
    for (const unrostered of unrosteredWithEspn) {
      if (areNamesSimilar(rostered.name, unrostered.name)) {
        potentialMatches.push({
          rostered,
          unrostered,
          rosteredNorm: normalizeName(rostered.name),
          unrosteredNorm: normalizeName(unrostered.name),
        });
      }
    }
  }

  if (potentialMatches.length === 0) {
    console.log('No fuzzy duplicates found!');
    return;
  }

  console.log('=== POTENTIAL FUZZY DUPLICATES ===\n');

  for (const match of potentialMatches) {
    console.log('ROSTERED (no ESPN ID):');
    console.log('  Name:', match.rostered.name);
    console.log('  ID:', match.rostered.id);
    console.log('  Team:', match.rostered.team);
    console.log('  Owner:', match.rostered.rosters.map(r => r.owner.name).join(', '));
    console.log('  Scores:', match.rostered.scores.length);

    console.log('UNROSTERED (has ESPN ID):');
    console.log('  Name:', match.unrostered.name);
    console.log('  ID:', match.unrostered.id);
    console.log('  ESPN ID:', match.unrostered.espnId);
    console.log('  Scores:', match.unrostered.scores.length);

    console.log('Normalized:', match.rosteredNorm, '<=>', match.unrosteredNorm);
    console.log('---');
  }

  console.log('\nTotal potential matches:', potentialMatches.length);

  // Output as JSON for the merge script
  console.log('\n=== MERGE DATA (for scripting) ===');
  const mergeData = potentialMatches.map(m => ({
    rosteredId: m.rostered.id,
    rosteredName: m.rostered.name,
    unrosteredId: m.unrostered.id,
    unrosteredName: m.unrostered.name,
    espnId: m.unrostered.espnId,
  }));
  console.log(JSON.stringify(mergeData, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
