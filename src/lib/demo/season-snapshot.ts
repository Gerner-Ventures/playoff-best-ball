// Reading captured postseasons off disk.
//
// A snapshot is a real NFL postseason, parsed through the same ESPN adapter the
// live app uses and frozen as JSON. Committing the parsed output rather than raw
// payloads keeps the files ~8x smaller and means the demo never depends on ESPN
// (or on ESPN's archive still looking the same) at runtime.
//
// Discovery is a directory scan with no index file, so adding a third season is
// dropping in `data/seasons/<year>/season.json` — data only, no code change.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { PlayerPosition } from "@prisma/client";
import { statLineSchema } from "@/domain/stats/stat-line";

const positionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DST"]);

const gameSchema = z.object({
  eventId: z.string().min(1),
  week: z.number().int().min(1).max(4),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  /** ISO string; the real kickoff, shifted onto the demo's timeline at read. */
  startsAt: z.string().datetime(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

const statLineEntrySchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  position: positionSchema.nullable(),
  nflTeam: z.string().min(1),
  stats: statLineSchema,
});

const poolPlayerSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  position: positionSchema,
  nflTeam: z.string().min(1),
});

export const demoSeasonSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  /** The real NFL season captured, e.g. 2024 = the playoffs held in Jan 2025. */
  capturedSeason: z.number().int(),
  label: z.string().min(1),
  capturedAt: z.string().datetime(),
  source: z.literal("espn"),
  teams: z.array(z.string().min(1)).min(2),
  weeks: z.array(z.object({ week: z.number().int().min(1).max(4), games: z.array(gameSchema) })),
  /** eventId -> stat lines */
  stats: z.record(z.string(), z.array(statLineEntrySchema)),
  pool: z.array(poolPlayerSchema).min(1),
});

export type DemoSeasonSnapshot = z.infer<typeof demoSeasonSnapshotSchema>;
export type SnapshotPoolPlayer = { externalId: string; name: string; position: PlayerPosition; nflTeam: string };

const SEASONS_DIR = path.join(process.cwd(), "data", "seasons");

export function seasonsDir(): string {
  return SEASONS_DIR;
}

export function snapshotPath(year: number): string {
  return path.join(SEASONS_DIR, String(year), "season.json");
}

/** Captured seasons available on disk, newest first. Directory scan — no index. */
export function listCapturedSeasons(): number[] {
  if (!existsSync(SEASONS_DIR)) return [];
  return readdirSync(SEASONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => Number(e.name))
    .filter((year) => existsSync(snapshotPath(year)))
    .sort((a, b) => b - a);
}

const cache = new Map<number, DemoSeasonSnapshot>();

/**
 * Loads and validates a captured season.
 *
 * Read with `fs`, never a static `import`: these files are a few hundred KB each,
 * and an import would inline every one of them into every route that transitively
 * touches this module.
 */
export function loadSeasonSnapshot(year: number): DemoSeasonSnapshot {
  const cached = cache.get(year);
  if (cached) return cached;

  const file = snapshotPath(year);
  if (!existsSync(file)) {
    const available = listCapturedSeasons();
    throw new Error(
      `No captured season ${year} at ${file}. ` +
        (available.length
          ? `Available: ${available.join(", ")}.`
          : "None captured yet — run `npm run demo:capture -- --season=<year>`."),
    );
  }

  const parsed = demoSeasonSnapshotSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`Captured season ${year} at ${file} is malformed: ${parsed.error.message}`);
  }
  cache.set(year, parsed.data);
  return parsed.data;
}
