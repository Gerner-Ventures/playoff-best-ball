// Turns a source id into a usable SeasonDataSource.
//
// Separate from season-source.ts so that file stays dependency-free: the two
// implementations import the types from it, and this resolver imports both of
// them, so nothing forms a cycle.

import type { PrismaClient } from "@prisma/client";
import { parseSourceId, sourceIdForEventId, type SeasonDataSource, type SourceId } from "../season-source";
import { syntheticSourceFromPool } from "../mock-season";
import { createHistoricalSource } from "./historical-source";
import { loadSeasonSnapshot, listCapturedSeasons } from "@/lib/demo/season-snapshot";

/** Default when nothing asks for anything: today's behavior, a fabricated season. */
export const DEFAULT_SOURCE_ID: SourceId = "synthetic";

/**
 * Resolves the id a CLI flag, env var or request body asked for.
 *
 * `synthetic` is built from whatever is already in the player pool, which is what
 * `advanceMockWeek` has always done. `historical:<year>` reads a committed capture.
 */
export async function resolveSeasonSource(
  db: PrismaClient,
  id: SourceId,
  season: number,
): Promise<SeasonDataSource> {
  const parsed = parseSourceId(id);
  if (parsed.kind === "synthetic") return syntheticSourceFromPool(db, season);
  return createHistoricalSource(loadSeasonSnapshot(parsed.season));
}

/**
 * Which source a season is already running on, read from the event-id prefixes on
 * its games. Null when the season is empty and the choice is still free.
 */
export async function detectSeasonSource(
  db: PrismaClient,
  season: number,
): Promise<SourceId | null> {
  const games = await db.nflGame.findMany({ where: { season }, select: { eventId: true } });
  for (const g of games) {
    const id = sourceIdForEventId(g.eventId);
    if (id) return id;
  }
  return null;
}

/** Every source that can be chosen right now — drives the admin selector. */
export function availableSourceIds(): SourceId[] {
  return ["synthetic", ...listCapturedSeasons().map((y) => `historical:${y}` as SourceId)];
}

/**
 * Reads a source id from a string, falling back to the env default then synthetic.
 * Throws on an unrecognized value rather than silently running the wrong season.
 */
export function sourceIdFromInput(raw: string | undefined): SourceId {
  const value = raw ?? process.env.DEMO_DATA_SOURCE ?? DEFAULT_SOURCE_ID;
  parseSourceId(value); // validates
  return value as SourceId;
}
