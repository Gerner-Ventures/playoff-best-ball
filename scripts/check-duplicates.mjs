import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";
import dotenv from "dotenv";

// Load environment variables
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
  // Find all players named Stefon Diggs
  const diggs = await prisma.player.findMany({
    where: {
      name: { contains: 'Diggs', mode: 'insensitive' }
    },
    include: {
      rosters: { include: { owner: true } },
      scores: true
    }
  });

  console.log('Players matching "Diggs":');
  diggs.forEach(p => {
    console.log('  ID:', p.id);
    console.log('  Name:', p.name);
    console.log('  ESPN ID:', p.espnId || 'NONE');
    console.log('  Team:', p.team);
    console.log('  Rostered by:', p.rosters.map(r => r.owner.name).join(', ') || 'NONE');
    console.log('  Scores:', p.scores.length);
    console.log('');
  });

  // Check for duplicate names
  const allPlayers = await prisma.player.findMany({
    select: { name: true, id: true, espnId: true, team: true },
    orderBy: { name: 'asc' }
  });

  const nameCounts = {};
  allPlayers.forEach(p => {
    if (!nameCounts[p.name]) nameCounts[p.name] = [];
    nameCounts[p.name].push(p);
  });

  const duplicates = Object.entries(nameCounts).filter(([name, players]) => players.length > 1);
  if (duplicates.length > 0) {
    console.log('\n=== DUPLICATE PLAYER NAMES ===');
    duplicates.forEach(([name, players]) => {
      console.log('\n' + name + ': ' + players.length + ' records');
      players.forEach(p => {
        console.log('  - ID:', p.id, '| ESPN:', p.espnId || 'NONE', '| Team:', p.team || 'NONE');
      });
    });
  } else {
    console.log('\nNo duplicate player names found.');
  }

  // Check for players with ESPN ID that are NOT rostered
  const playersWithEspnNotRostered = await prisma.player.findMany({
    where: {
      espnId: { not: null },
      rosters: { none: {} }
    },
    select: { id: true, name: true, espnId: true, team: true }
  });

  if (playersWithEspnNotRostered.length > 0) {
    console.log('\n=== PLAYERS WITH ESPN ID BUT NOT ROSTERED ===');
    playersWithEspnNotRostered.forEach(p => {
      console.log('  ' + p.name + ' (ID: ' + p.id + ', ESPN: ' + p.espnId + ')');
    });
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
