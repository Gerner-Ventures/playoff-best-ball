import { Prisma, type PrismaClient } from "@prisma/client";
import { NotCommissionerError, PremiumFeatureError } from "../errors";
import {
  leagueSettingsSchema,
  parseLeagueSettings,
  SCORING_PRESETS,
  type ScoringPresetName,
  type ScoringSettings,
} from "../league-settings";

export interface UpdateLeagueSettingsInput {
  leagueId: string;
  userId: string;
  /** Free tier: switch presets. Ignored when `scoring` is provided. */
  scoringPreset?: ScoringPresetName;
  /** Premium only: full custom values (sets scoringPreset to "custom"). */
  scoring?: ScoringSettings;
  /** undefined = leave unchanged; null = clear. */
  entryFeeCents?: number | null;
  venmoHandle?: string | null;
  substitutionsEnabled?: boolean;
}

/**
 * Commissioner settings updates. Scoring changes recompute standings automatically
 * (points are computed at read) — the UI warns about mid-season changes; we don't block them.
 */
export async function updateLeagueSettings(db: PrismaClient, input: UpdateLeagueSettingsInput) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();

  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  const settings = parseLeagueSettings(league.settings);

  if (input.scoring) {
    if (league.tier !== "PREMIUM") throw new PremiumFeatureError("Custom scoring");
    settings.scoring = { ...input.scoring };
    settings.scoringPreset = "custom";
  } else if (input.scoringPreset) {
    settings.scoring = { ...SCORING_PRESETS[input.scoringPreset] };
    settings.scoringPreset = input.scoringPreset;
  }
  if (input.entryFeeCents !== undefined) settings.entryFeeCents = input.entryFeeCents;
  if (input.venmoHandle !== undefined) settings.venmoHandle = input.venmoHandle;
  if (input.substitutionsEnabled !== undefined) {
    settings.substitutionsEnabled = input.substitutionsEnabled;
  }

  // Defense-in-depth: no route drift may ever persist a blob the scoring engine can't parse.
  const validated = leagueSettingsSchema.parse(settings);
  return db.league.update({
    where: { id: input.leagueId },
    data: { settings: validated as Prisma.InputJsonValue },
  });
}
