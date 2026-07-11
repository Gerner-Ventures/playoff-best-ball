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

// Names to search for (rostered player name -> likely correct name patterns)
const namesToSearch = [
  { rostered: "Jason Meyers", patterns: ["Jason Myers", "Myers"] },
  { rostered: "Will Lutz", patterns: ["Wil Lutz", "Lutz"] },
  { rostered: "Troy Franklin", patterns: ["Troy Franklin", "Franklin"] },
];

async function main() {
  console.log('\n=== SEARCHING FOR NAME MATCHES ===\n');

  // Get all players with ESPN ID (these came from ESPN)
  const espnPlayers = await prisma.player.findMany({
    where: { espnId: { not: null } },
    select: { id: true, name: true, espnId: true, team: true, position: true }
  });

  // Get rostered players without ESPN ID
  const rosteredNoEspn = await prisma.player.findMany({
    where: {
      espnId: null,
      rosters: { some: {} }
    },
    include: {
      rosters: { include: { owner: true } }
    }
  });

  console.log('Rostered players without ESPN ID:', rosteredNoEspn.length);
  console.log('Players with ESPN ID:', espnPlayers.length);
  console.log('');

  for (const search of namesToSearch) {
    console.log(`\n=== Searching for matches to "${search.rostered}" ===`);

    // Find the rostered player
    const rostered = rosteredNoEspn.find(p => p.name === search.rostered);
    if (rostered) {
      console.log('Rostered player found:');
      console.log('  ID:', rostered.id);
      console.log('  Position:', rostered.position);
      console.log('  Team:', rostered.team);
      console.log('  Owner:', rostered.rosters.map(r => r.owner.name).join(', '));
    } else {
      console.log('  Rostered player NOT FOUND');
    }

    // Search ESPN players for matches
    console.log('\nPotential ESPN matches:');
    for (const pattern of search.patterns) {
      const matches = espnPlayers.filter(p =>
        p.name.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(p.name.toLowerCase())
      );

      if (matches.length > 0) {
        for (const match of matches) {
          // Check if same team/position
          const sameTeam = rostered && match.team === rostered.team;
          const samePos = rostered && match.position === rostered.position;
          const likely = sameTeam && samePos ? '*** LIKELY MATCH ***' : '';

          console.log(`  "${match.name}" (ESPN: ${match.espnId}, Team: ${match.team}, Pos: ${match.position}) ${likely}`);
        }
      }
    }
  }

  // Also list DST players without ESPN IDs
  console.log('\n\n=== DST PLAYERS WITHOUT ESPN ID ===');
  const dstPlayers = rosteredNoEspn.filter(p => p.position === 'DST');
  for (const p of dstPlayers) {
    console.log(`  "${p.name}" (Team: ${p.team})`);
    console.log(`    Owner: ${p.rosters.map(r => r.owner.name).join(', ')}`);

    // Try to find matching DST in ESPN
    const teamCode = p.team;
    const dstMatches = espnPlayers.filter(ep =>
      ep.position === 'D/ST' &&
      (ep.team === teamCode || ep.name.toLowerCase().includes(teamCode?.toLowerCase() || ''))
    );
    if (dstMatches.length > 0) {
      console.log('    Potential ESPN matches:');
      for (const m of dstMatches) {
        console.log(`      "${m.name}" (ESPN: ${m.espnId}, Team: ${m.team})`);
      }
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
