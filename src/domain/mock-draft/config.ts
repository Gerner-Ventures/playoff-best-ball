import { z } from "zod";
import { rosterSlotSchema } from "../league-settings";
import { PREMIUM_MAX_ENTRIES } from "../leagues/upgrade-league";

/** Mock setup configures only what changes the draft: how many teams, and the
 *  roster shape. Scoring is deliberately absent — a mock plays no games, and
 *  Player.defaultRank is not per-preset, so a scoring picker would be inert. */
export const mockDraftConfigSchema = z.object({
  teamCount: z.number().int().min(2).max(PREMIUM_MAX_ENTRIES),
  rosterSlots: z.array(rosterSlotSchema).min(1),
});

export type MockDraftConfig = z.infer<typeof mockDraftConfigSchema>;

export const mockPickSchema = z.object({
  pickIndex: z.number().int().nonnegative(),
  seat: z.string(),
  playerId: z.string(),
  slotIndex: z.number().int().nonnegative(),
});

export type MockPick = z.infer<typeof mockPickSchema>;
export const mockPicksSchema = z.array(mockPickSchema);
