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

// Case-insensitive; matched against a whole word including its trailing period.
const HONORIFICS = new Set(["dr.", "mr.", "mrs.", "ms.", "mx.", "prof."]);

export function firstName(name: string | null | undefined): string | null {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  let i = 0;
  while (i < words.length && HONORIFICS.has(words[i].toLowerCase())) i++;
  const first = words[i];
  return first ? first : null;
}

export type DraftTimeLabel = { kind: "upcoming"; at: Date } | { kind: "not_started" } | { kind: "unscheduled" };

/**
 * What to show for the draft time. A scheduled time only reads as "upcoming" once
 * the draft has actually started or the time is still ahead of `now` — otherwise a
 * stale schedule (commissioner picked a time, nobody started the draft, the moment
 * passed) would misleadingly look like it's still coming up.
 */
export function draftTimeLabel(
  preview: Pick<InvitePreview, "draftScheduledAt" | "draftStarted">,
  now: Date,
): DraftTimeLabel {
  if (!preview.draftScheduledAt) return { kind: "unscheduled" };
  if (!preview.draftStarted && now >= preview.draftScheduledAt) return { kind: "not_started" };
  return { kind: "upcoming", at: preview.draftScheduledAt };
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
