import type { PrismaClient } from "@prisma/client";
import { FREE_TIER_MAX_ENTRIES, tryParseLeagueSettings } from "../league-settings";

export interface InvitePreview {
  leagueName: string;
  season: number;
  commissionerFirstName: string | null;
  draftScheduledAt: Date | null;
  draftStarted: boolean;
  entryCount: number;
  maxEntries: number;
}

/**
 * What a signed-out visitor holding an invite code may see (spec §7). This is no more
 * than joining would reveal, and only the commissioner's first name.
 */
export async function getInvitePreview(db: PrismaClient, code: string): Promise<InvitePreview | null> {
  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: {
      _count: { select: { entries: true } },
      draft: { select: { id: true } },
      memberships: { where: { role: "COMMISSIONER" }, take: 1, include: { user: { select: { name: true } } } },
    },
  });
  if (!league) return null;
  const settings = tryParseLeagueSettings(league.settings);
  return {
    leagueName: league.name,
    season: league.season,
    commissionerFirstName: firstName(league.memberships[0]?.user.name),
    draftScheduledAt: league.draftScheduledAt,
    draftStarted: league.draft !== null,
    entryCount: league._count.entries,
    maxEntries: settings?.maxEntries ?? FREE_TIER_MAX_ENTRIES,
  };
}

export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function formatDraftTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  })
    .format(date)
    // Some ICU versions emit a narrow no-break space (U+202F) before AM/PM.
    .replace(/ /g, " ");
}
