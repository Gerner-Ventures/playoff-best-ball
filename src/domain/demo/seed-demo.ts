// Builds a complete, coherent demo world in any phase of the product.
//
// Everything here goes through the REAL domain functions — createLeague,
// joinLeague, startDraftForLeague, autodraftCurrentPick, syncPlayerPool,
// syncWeekStats. Nothing writes league or draft rows by hand. That is deliberate:
// a demo assembled out of hand-written rows can drift into states the app itself
// could never produce, and then it tests nothing.
//
// Safety note worth stating plainly: applyPickAndAdvance does not emit
// draft/turn.started (announceDraftState is only called from the API routes and
// Inngest functions), so seeding a draft cannot arm a real pick clock or send
// notifications, even against a fully-wired environment.

import type { LeagueTier, PrismaClient } from "@prisma/client";
import { createLeague } from "../leagues/create-league";
import { joinLeague } from "../leagues/join-league";
import { upgradeLeaguePremium } from "../leagues/upgrade-league";
import { startDraftForLeague } from "../draft/start-draft";
import { autodraftCurrentPick } from "../draft/autodraft";
import { computePickDeadline } from "../draft/pick-clock";
import { entryIdForPick, totalPicks } from "../draft/snake-order";
import { parseLeagueSettings } from "../league-settings";
import { syncPlayerPool } from "../stats/sync-pool";
import { syncWeekStats } from "../stats/sync-week";
import { FakeStatsProvider } from "../stats/fake-provider";
import type { SeasonDataSource } from "../stats/season-source";
import { PLAYOFF_WEEKS } from "../season";
import { markDemoEnvironment } from "@/lib/demo-mode";
import {
  DEMO_BOTS,
  DEMO_EMAIL_DOMAIN,
  DEMO_LEAGUES,
  DEMO_PASSWORD,
  DEMO_PERSONA,
} from "./fixtures";

const ALL_WEEKS = Object.values(PLAYOFF_WEEKS);

export type DemoPhase = "pre-draft" | "draft" | "live";

/** Creates a sign-in-able account. Better Auth hashes internally, so the seeder
 * cannot write Account rows itself — the caller supplies a real signup function. */
export type CreateAccount = (input: {
  name: string;
  email: string;
  password: string;
}) => Promise<{ id: string }>;

export interface SeedDemoInput {
  phase: DemoPhase;
  /** live only: weeks 1..N are FINAL, the rest SCHEDULED. */
  week?: number;
  source: SeasonDataSource;
  season: number;
  createAccount: CreateAccount;
  now?: Date;
}

export interface SeedDemoLeague {
  id: string;
  name: string;
  tier: LeagueTier;
  inviteCode: string;
  /** entry name -> total points, as the seeder's own data implies. */
  entryCount: number;
}

export interface SeedDemoResult {
  password: string;
  personaEmail: string;
  accounts: { name: string; email: string }[];
  leagues: SeedDemoLeague[];
  weeksFinal: number[];
  weeksScheduled: number[];
  /** The entry the persona is on the clock for, when phase is "draft". */
  onClockEntryId?: string;
}

/**
 * Removes only demo-owned rows. Deliberately not resetDb(): this runs against a
 * long-lived demo database that may hold real sessions, and a seeder that wipes
 * everything is a far worse foot-gun than one that rebuilds its own corner.
 */
export async function deleteDemoData(db: PrismaClient, season: number): Promise<void> {
  const codes = Object.values(DEMO_LEAGUES).map((l) => l.inviteCode);
  const leagues = await db.league.findMany({
    where: { inviteCode: { in: codes } },
    select: { id: true },
  });
  const leagueIds = leagues.map((l) => l.id);

  if (leagueIds.length > 0) {
    // Children first. Cascades cover most of this, but being explicit keeps the
    // order obvious to a reader and survives a future relation losing its cascade.
    await db.draftQueueItem.deleteMany({ where: { entry: { leagueId: { in: leagueIds } } } });
    await db.draftPick.deleteMany({ where: { draft: { leagueId: { in: leagueIds } } } });
    await db.draft.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await db.substitution.deleteMany({ where: { entry: { leagueId: { in: leagueIds } } } });
    await db.entry.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await db.membership.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await db.duesCollectionInterest.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await db.leaguePurchase.deleteMany({ where: { leagueId: { in: leagueIds } } });
    await db.league.deleteMany({ where: { id: { in: leagueIds } } });
  }

  // Season data written by any demo source. Player rows survive — re-syncing the
  // pool is idempotent, and PlayerStat/DraftPick would restrict deletion anyway.
  await db.playerStat.deleteMany({ where: { season } });
  await db.nflGame.deleteMany({ where: { season } });
  await db.teamOdds.deleteMany({ where: { season } });

  // Demo accounts, by their reserved domain. Cascades take sessions and accounts.
  await db.user.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
}

export async function seedDemo(db: PrismaClient, input: SeedDemoInput): Promise<SeedDemoResult> {
  const { phase, source, season, createAccount } = input;
  const now = input.now ?? new Date();
  const playedThroughWeek = phase === "live" ? (input.week ?? 2) : 0;
  if (phase === "live" && (playedThroughWeek < 1 || playedThroughWeek > 4)) {
    throw new Error(`--week must be 1..4 for the live phase, got ${playedThroughWeek}`);
  }

  await deleteDemoData(db, season);
  // Marks this database as a demo database — the out-of-band half of the password
  // auth gate. Only ever written here, never from the request path.
  await markDemoEnvironment(db, `demo seed (${source.id}, ${phase})`);

  // --- accounts -----------------------------------------------------------
  const persona = await createAccount({
    name: DEMO_PERSONA.name,
    email: DEMO_PERSONA.email,
    password: DEMO_PASSWORD,
  });
  const bots = [];
  for (const bot of DEMO_BOTS) {
    bots.push({ ...bot, user: await createAccount({ ...bot, password: DEMO_PASSWORD }) });
  }

  // --- player pool --------------------------------------------------------
  // Through the real pool-sync path, so the demo exercises it rather than
  // bypassing it. The captured pool is ~186 players; the 39-player dev fixture
  // cannot fill 12 rosters and startDraftForLeague would refuse.
  const seasonData = source.seasonData({ playedThroughWeek, now, season });
  await syncPlayerPool(db, new FakeStatsProvider(seasonData), { season, teams: source.teams });
  await applyDefaultRanks(db, season, source);

  // --- leagues ------------------------------------------------------------
  // Premium FIRST: createLeague allows only one FREE league per commissioner
  // unless they already own a premium one this season. Reversed, this throws
  // FreeLeagueLimitError on the second league.
  const premium = await createDemoLeague(db, {
    spec: DEMO_LEAGUES.premium,
    personaId: persona.id,
    bots,
    premium: true,
  });
  const free = await createDemoLeague(db, {
    spec: DEMO_LEAGUES.free,
    personaId: persona.id,
    bots,
    premium: false,
  });

  const result: SeedDemoResult = {
    password: DEMO_PASSWORD,
    personaEmail: DEMO_PERSONA.email,
    accounts: [DEMO_PERSONA, ...DEMO_BOTS].map((a) => ({ name: a.name, email: a.email })),
    leagues: [premium, free].map((l) => ({
      id: l.id,
      name: l.name,
      tier: l.tier,
      inviteCode: l.inviteCode,
      entryCount: l.entryCount,
    })),
    weeksFinal: [],
    weeksScheduled: [],
  };

  if (phase === "pre-draft") {
    // Nothing more: the absence of a Draft row IS the pre-draft phase.
    return result;
  }

  for (const league of [premium, free]) {
    await startDraftForLeague(db, { leagueId: league.id, order: league.entryIds });
  }

  if (phase === "draft") {
    // Drive the premium league to the persona's turn so the draft room is live
    // and pickable; run the free league to completion so the dashboard shows
    // both a draft in progress and a finished one.
    result.onClockEntryId = await draftUntilPersonaIsOnClock(db, premium);
    await draftToCompletion(db, free);
    return result;
  }

  // --- live ---------------------------------------------------------------
  for (const league of [premium, free]) await draftToCompletion(db, league);

  // All four weeks, every time. Weeks past `playedThroughWeek` land as SCHEDULED
  // rows, which is what getLeagueProjections needs to compute a nextWeek; with no
  // rows at all it returns nextWeek: null and premium projections render empty.
  const provider = new FakeStatsProvider(seasonData);
  for (const week of ALL_WEEKS) {
    await syncWeekStats(db, provider, { season, week });
  }

  // Watermarks: tells the engagement cron these weeks are already handled, so a
  // fully-wired demo cannot blast a backlog of recaps on its first tick.
  await db.league.updateMany({
    where: { id: { in: [premium.id, free.id] } },
    data: { lastRecapWeek: playedThroughWeek, lastPreviewWeek: playedThroughWeek },
  });

  result.weeksFinal = ALL_WEEKS.filter((w) => w <= playedThroughWeek);
  result.weeksScheduled = ALL_WEEKS.filter((w) => w > playedThroughWeek);
  return result;
}

// --- helpers --------------------------------------------------------------

interface DemoLeague {
  id: string;
  name: string;
  tier: LeagueTier;
  inviteCode: string;
  entryIds: string[];
  personaEntryId: string;
  entryCount: number;
}

async function createDemoLeague(
  db: PrismaClient,
  opts: {
    spec: { name: string; inviteCode: string; entryCount: number };
    personaId: string;
    bots: { teamName: string; user: { id: string } }[];
    premium: boolean;
  },
): Promise<DemoLeague> {
  const created = await createLeague(db, {
    userId: opts.personaId,
    name: opts.spec.name,
    teamName: DEMO_PERSONA.teamName,
    scoringPreset: "half_ppr",
    // 24h gives the draft room a deadline that reads plausibly for a whole day.
    pickClockHours: 24,
  });

  if (opts.premium) await upgradeLeaguePremium(db, { leagueId: created.id });

  // Pin the invite code so `/join/DEMO2026` is a stable, shareable URL.
  await db.league.update({
    where: { id: created.id },
    data: { inviteCode: opts.spec.inviteCode },
  });

  for (const bot of opts.bots.slice(0, opts.spec.entryCount - 1)) {
    await joinLeague(db, {
      userId: bot.user.id,
      inviteCode: opts.spec.inviteCode,
      teamName: bot.teamName,
    });
  }

  const league = await db.league.findUniqueOrThrow({
    where: { id: created.id },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });

  const personaEntry = await db.entry.findFirstOrThrow({
    where: { leagueId: league.id, membership: { userId: opts.personaId } },
  });

  return {
    id: league.id,
    name: league.name,
    tier: league.tier,
    inviteCode: opts.spec.inviteCode,
    // Creation order, not shuffled: a deterministic draft order means the same
    // seed produces the same rosters every time.
    entryIds: league.entries.map((e) => e.id),
    personaEntryId: personaEntry.id,
    entryCount: league.entries.length,
  };
}

/** Applies the source's draft-board ordering over the ranks syncPlayerPool assigned. */
async function applyDefaultRanks(
  db: PrismaClient,
  season: number,
  source: SeasonDataSource,
): Promise<void> {
  // syncPlayerPool appends ranks in roster order, which would have autodraft take
  // all of one team before touching the next — an obviously fake board.
  const ranks = source.defaultRanks();
  const players = await db.player.findMany({
    where: { season },
    select: { id: true, externalId: true },
  });
  const idByExternal = new Map(players.map((p) => [p.externalId, p.id]));

  const updates = ranks
    .map((r) => ({ id: idByExternal.get(r.externalId), defaultRank: r.defaultRank }))
    .filter((u): u is { id: string; defaultRank: number } => u.id !== undefined);

  // defaultRank is unique per season, so shift every row out of the way first —
  // otherwise a partial reordering collides with ranks not yet reassigned.
  const offset = players.length + 1000;
  await db.$transaction(
    updates.map((u) =>
      db.player.update({ where: { id: u.id }, data: { defaultRank: u.defaultRank + offset } }),
    ),
  );
  await db.$transaction(
    updates.map((u) =>
      db.player.update({ where: { id: u.id }, data: { defaultRank: u.defaultRank } }),
    ),
  );
}

async function currentPickIndex(db: PrismaClient, leagueId: string): Promise<number | null> {
  const draft = await db.draft.findUnique({
    where: { leagueId },
    select: { currentPickIndex: true, status: true },
  });
  return draft && draft.status === "ACTIVE" ? draft.currentPickIndex : null;
}

async function draftToCompletion(db: PrismaClient, league: DemoLeague): Promise<void> {
  for (;;) {
    const index = await currentPickIndex(db, league.id);
    if (index === null) return;
    const made = await autodraftCurrentPick(db, { leagueId: league.id, expectedPickIndex: index });
    if (!made) return; // pool exhausted or draft finished — either way, stop
  }
}

/**
 * Autodrafts until the persona is on the clock, leaving a genuinely live draft:
 * real picks behind it, a real future deadline, and the visitor's turn to act.
 */
async function draftUntilPersonaIsOnClock(
  db: PrismaClient,
  league: DemoLeague,
): Promise<string | undefined> {
  const draft = await db.draft.findUniqueOrThrow({ where: { leagueId: league.id } });
  const settings = parseLeagueSettings(
    (await db.league.findUniqueOrThrow({ where: { id: league.id } })).settings,
  );
  const picks = totalPicks(league.entryIds.length, settings.rosterSlots.length);

  // Start partway in so the board has history, then stop on the persona's turn.
  const target = Math.min(league.entryIds.length * 2, picks - 1);
  for (let i = 0; i < picks; i++) {
    const index = await currentPickIndex(db, league.id);
    if (index === null) break;
    const onClock = entryIdForPick(league.entryIds, index);
    if (index >= target && onClock === league.personaEntryId) break;
    if (!(await autodraftCurrentPick(db, { leagueId: league.id, expectedPickIndex: index }))) break;
  }

  // Refresh the deadline so it is measured from now rather than from whenever the
  // last bot pick happened, which for a re-run seed could already be in the past.
  await db.draft.update({
    where: { id: draft.id },
    data: {
      currentDeadline: computePickDeadline(
        new Date(),
        settings.pickClockHours,
        settings.overnightPause,
      ),
    },
  });
  return league.personaEntryId;
}
