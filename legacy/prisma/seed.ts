// Seed script for playoff best ball database
import * as dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Position, RosterSlot } from "@prisma/client";

// Roster data from your spreadsheet
const ROSTERS_2025 = [
  {
    owner: "JC",
    players: [
      { name: "Matthew Stafford", position: "QB", slot: "QB" },
      { name: "TreVeyon Henderson", position: "RB", slot: "RB1" },
      { name: "Woody Marks", position: "RB", slot: "RB2" },
      { name: "AJ Brown", position: "WR", slot: "WR1" },
      { name: "Kayshon Boutte", position: "WR", slot: "WR2" },
      { name: "George Kittle", position: "TE", slot: "TE" },
      { name: "Rome Odunze", position: "WR", slot: "FLEX" },
      { name: "Cairo Santos", position: "K", slot: "K" },
      { name: "Houston Texans", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Brad",
    players: [
      { name: "Caleb Williams", position: "QB", slot: "QB" },
      { name: "James Cook", position: "RB", slot: "RB1" },
      { name: "Rhamondre Stevenson", position: "RB", slot: "RB2" },
      { name: "Puka Nacua", position: "WR", slot: "WR1" },
      { name: "Jakobi Meyers", position: "WR", slot: "WR2" },
      { name: "Dalton Schultz", position: "TE", slot: "TE" },
      { name: "Blake Corum", position: "RB", slot: "FLEX" },
      { name: "Harrison Mevis", position: "K", slot: "K" },
      { name: "Los Angeles Rams", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Johnny",
    players: [
      { name: "Drake Maye", position: "QB", slot: "QB" },
      { name: "D'Andre Swift", position: "RB", slot: "RB1" },
      { name: "Jaylen Warren", position: "RB", slot: "RB2" },
      { name: "Devonta Smith", position: "WR", slot: "WR1" },
      { name: "Troy Franklin", position: "WR", slot: "WR2" },
      { name: "Dalton Kincaid", position: "TE", slot: "TE" },
      { name: "Brian Thomas Jr", position: "WR", slot: "FLEX" },
      { name: "Jason Meyers", position: "K", slot: "K" },
      { name: "New England Patriots", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Ben",
    players: [
      { name: "Jalen Hurts", position: "QB", slot: "QB" },
      { name: "Zach Charbonnet", position: "RB", slot: "RB1" },
      { name: "Kenny Gainwell", position: "RB", slot: "RB2" },
      { name: "Jaxon Smith-Njigba", position: "WR", slot: "WR1" },
      { name: "Stefon Diggs", position: "WR", slot: "WR2" },
      { name: "AJ Barner", position: "TE", slot: "TE" },
      { name: "Luther Burden", position: "WR", slot: "FLEX" },
      { name: "Andy Borregales", position: "K", slot: "K" },
      { name: "Jacksonville Jaguars", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Nick",
    players: [
      { name: "Bo Nix", position: "QB", slot: "QB" },
      { name: "Kenneth Walker", position: "RB", slot: "RB1" },
      { name: "Christian McCaffrey", position: "RB", slot: "RB2" },
      { name: "Nico Collins", position: "WR", slot: "WR1" },
      { name: "DJ Moore", position: "WR", slot: "WR2" },
      { name: "Brenton Strange", position: "TE", slot: "TE" },
      { name: "Omarion Hampton", position: "RB", slot: "FLEX" },
      { name: "Cam Little", position: "K", slot: "K" },
      { name: "Buffalo Bills", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Jon",
    players: [
      { name: "Josh Allen", position: "QB", slot: "QB" },
      { name: "Saquon Barkley", position: "RB", slot: "RB1" },
      { name: "RJ Harvey", position: "RB", slot: "RB2" },
      { name: "Khalil Shakir", position: "WR", slot: "WR1" },
      { name: "Jayden Higgins", position: "WR", slot: "WR2" },
      { name: "Dallas Goedert", position: "TE", slot: "TE" },
      { name: "Colston Loveland", position: "TE", slot: "FLEX" },
      { name: "Jake Elliot", position: "K", slot: "K" },
      { name: "Philadelphia Eagles", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Eli",
    players: [
      { name: "Sam Darnold", position: "QB", slot: "QB" },
      { name: "Travis Etienne", position: "RB", slot: "RB1" },
      { name: "Kyle Monangai", position: "RB", slot: "RB2" },
      { name: "Davante Adams", position: "WR", slot: "WR1" },
      { name: "Courtland Sutton", position: "WR", slot: "WR2" },
      { name: "Hunter Henry", position: "TE", slot: "TE" },
      { name: "DK Metcalf", position: "WR", slot: "FLEX" },
      { name: "Will Lutz", position: "K", slot: "K" },
      { name: "Denver Broncos", position: "DST", slot: "DST" },
    ],
  },
  {
    owner: "Sam",
    players: [
      { name: "Trevor Lawrence", position: "QB", slot: "QB" },
      { name: "Kyren Williams", position: "RB", slot: "RB1" },
      { name: "Josh Jacobs", position: "RB", slot: "RB2" },
      { name: "Parker Washington", position: "WR", slot: "WR1" },
      { name: "Christian Watson", position: "WR", slot: "WR2" },
      { name: "Tyler Higbee", position: "TE", slot: "TE" },
      { name: "Pat Bryant", position: "WR", slot: "FLEX" },
      { name: "Ka'imi Fairbairn", position: "K", slot: "K" },
      { name: "Seattle Seahawks", position: "DST", slot: "DST" },
    ],
  },
];

async function main() {
  // Use DIRECT_URL for seeding (non-pooled connection)
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_URL environment variable is not set");
  }

  console.log("Connecting to database...");
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Seeding database...");
    const year = 2025;

    for (const roster of ROSTERS_2025) {
      // Create owner
      const owner = await prisma.owner.upsert({
        where: { name: roster.owner },
        update: {},
        create: { name: roster.owner },
      });
      console.log(`Created owner: ${owner.name}`);

      // Create players and roster entries
      for (const playerData of roster.players) {
        // Create player
        const player = await prisma.player.upsert({
          where: {
            name_position: {
              name: playerData.name,
              position: playerData.position as Position,
            },
          },
          update: {},
          create: {
            name: playerData.name,
            position: playerData.position as Position,
          },
        });

        // Create roster entry
        await prisma.roster.upsert({
          where: {
            ownerId_playerId_year: {
              ownerId: owner.id,
              playerId: player.id,
              year,
            },
          },
          update: {
            rosterSlot: playerData.slot as RosterSlot,
          },
          create: {
            ownerId: owner.id,
            playerId: player.id,
            rosterSlot: playerData.slot as RosterSlot,
            year,
          },
        });

        console.log(`  Added ${playerData.name} (${playerData.slot})`);
      }
    }

    // Create default scoring settings
    await prisma.scoringSettings.upsert({
      where: { year },
      update: {},
      create: { year },
    });

    console.log("Seeding complete!");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
