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
  // Get all players with ESPN ID
  const espnPlayers = await prisma.player.findMany({
    where: { espnId: { not: null } },
    select: { id: true, name: true, espnId: true, team: true, position: true },
    orderBy: { position: 'asc' }
  });

  console.log('\n=== KICKERS (K) ===');
  const kickers = espnPlayers.filter(p => p.position === 'K');
  console.log('Count:', kickers.length);
  kickers.forEach(k => {
    console.log(`  ${k.name} (ESPN: ${k.espnId}, Team: ${k.team})`);
  });

  console.log('\n=== DEFENSE/SPECIAL TEAMS ===');
  const dst = espnPlayers.filter(p => p.position === 'D/ST' || p.position === 'DST' || p.position === 'DEF');
  console.log('Count:', dst.length);
  dst.forEach(d => {
    console.log(`  ${d.name} (ESPN: ${d.espnId}, Team: ${d.team}, Pos: ${d.position})`);
  });

  console.log('\n=== SEA PLAYERS ===');
  const seaPlayers = espnPlayers.filter(p => p.team === 'SEA');
  seaPlayers.forEach(p => {
    console.log(`  ${p.name} (ESPN: ${p.espnId}, Pos: ${p.position})`);
  });

  console.log('\n=== DEN PLAYERS ===');
  const denPlayers = espnPlayers.filter(p => p.team === 'DEN');
  denPlayers.forEach(p => {
    console.log(`  ${p.name} (ESPN: ${p.espnId}, Pos: ${p.position})`);
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
