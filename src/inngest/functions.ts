import { NonRetriableError } from "inngest";
import { db } from "@/lib/db";

const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
import { inngest } from "@/lib/inngest";
import { channelsFor, loadRecipient, notifyVia } from "@/lib/notify";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { announceDraftState } from "@/lib/draft-events";
import { startDraftForLeague } from "@/domain/draft/start-draft";
import { DomainError, DraftAlreadyStartedError } from "@/domain/errors";
import { espnProvider } from "@/lib/stats/espn-provider";
import { syncWeekStats } from "@/domain/stats/sync-week";
import { oddsProvider } from "@/lib/odds/odds-api-provider";
import { syncTeamOdds } from "@/domain/odds/sync-odds";
import { CURRENT_SEASON, PLAYOFF_WEEKS } from "@/domain/season";
import { findDueRecaps, findDuePreviews } from "@/domain/engagement/due-work";
import { getEliminatedTeams } from "@/domain/stats/eliminated-teams";
import { buildWeeklyRecap } from "@/domain/engagement/recap";
import { effectivePlayerForWeek, getLeagueScores } from "@/lib/league-scores";
import { roundPoints } from "@/domain/scoring/compute-points";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * Pick clock: sleeps until the turn's deadline, then autodrafts if (and only if)
 * that pick is still open. autodraftCurrentPick is idempotent against stale timers.
 *
 * Inngest v4: trigger belongs in the options object as `triggers: { event }`.
 */
export const draftPickClock = inngest.createFunction(
  { id: "draft-pick-clock", triggers: { event: "draft/turn.started" } },
  async ({ event, step }) => {
    await step.sleepUntil("until-deadline", event.data.deadline);
    const result = await step.run("autodraft-if-still-open", async () => {
      try {
        return await autodraftCurrentPick(db, {
          leagueId: event.data.leagueId,
          expectedPickIndex: event.data.pickIndex,
        });
      } catch (err) {
        // Pool exhaustion = misconfigured league; retrying can never succeed.
        if (err instanceof Error && err.message.includes("no draftable player")) {
          throw new NonRetriableError(err.message);
        }
        throw err;
      }
    });
    if (result) {
      // Autodraft advanced the draft; arm the next turn (or announce completion).
      await step.run("announce-next-turn", () =>
        announceDraftState(db, event.data.leagueId),
      );
    }
  },
);

/** "You're on the clock" to the on-clock entry's owner — one step per channel. */
export const notifyOnTheClock = inngest.createFunction(
  { id: "draft-notify-on-the-clock", triggers: { event: "draft/turn.started" } },
  async ({ event, step }) => {
    const loaded = await step.run("load-recipient", async () => {
      // Phase 4 multi-entry: entry→membership→user is 1:1 today; multi-entry needs per-entry contact resolution.
      const entry = await db.entry.findUniqueOrThrow({
        where: { id: event.data.entryId },
        include: { membership: true, league: { select: { name: true } } },
      });
      return {
        recipient: await loadRecipient(db, entry.membership.userId),
        leagueName: entry.league.name,
      };
    });
    const deadline = new Date(event.data.deadline);
    const deadlineEt = deadline.toLocaleString("en-US", { timeZone: "America/New_York" });
    const draftUrl = `${APP_URL}/leagues/${event.data.leagueId}/draft`;
    const notification = {
      subject: `You're on the clock in ${loaded.leagueName}`,
      text: [
        `It's your pick in ${loaded.leagueName} (pick ${event.data.pickIndex + 1}).`,
        `Your clock runs out ${deadlineEt} ET — after that we'll autodraft from your queue.`,
        `Make your pick: ${draftUrl}`,
      ].join("\n\n"),
      smsText: `You're on the clock in ${loaded.leagueName}! Pick by ${deadlineEt} ET or we autodraft. ${draftUrl}`,
      url: draftUrl,
    };
    for (const channel of channelsFor(loaded.recipient)) {
      await step.run(`send-${channel}`, () =>
        notifyVia(db, channel, loaded.recipient, notification),
      );
    }
  },
);

/** Draft-complete to every member — one step per member × channel. */
export const notifyDraftComplete = inngest.createFunction(
  { id: "draft-notify-complete", triggers: { event: "draft/completed" } },
  async ({ event, step }) => {
    const loaded = await step.run("load-recipients", async () => {
      const memberships = await db.membership.findMany({
        where: { leagueId: event.data.leagueId },
        include: { league: { select: { name: true } } },
      });
      const recipients = [];
      for (const m of memberships) {
        recipients.push({ membershipId: m.id, recipient: await loadRecipient(db, m.userId) });
      }
      return {
        recipients,
        leagueName: memberships[0]?.league.name ?? "your league",
        // Analytics actor: the commissioner is the monetization-funnel identity for a
        // league-level milestone (they created it, they pay for premium).
        commissionerUserId:
          memberships.find((m) => m.role === "COMMISSIONER")?.userId ?? null,
      };
    });
    const draftUrl = `${APP_URL}/leagues/${event.data.leagueId}/draft`;
    const notification = {
      subject: `${loaded.leagueName}: the draft is complete`,
      text: `All picks are in. See every roster: ${draftUrl}`,
      url: draftUrl,
    };
    for (const { membershipId, recipient } of loaded.recipients) {
      for (const channel of channelsFor(recipient)) {
        await step.run(`send-${membershipId}-${channel}`, () =>
          notifyVia(db, channel, recipient, notification),
        );
      }
    }
    // Plain await, not a step: captureServerEvent never throws and needs no retry;
    // trailing code only executes on the run where all send steps are memoized.
    // distinctId falls back to "system" if the league somehow lost its commissioner.
    await captureServerEvent(
      loaded.commissionerUserId ?? "system",
      ANALYTICS_EVENTS.DRAFT_COMPLETED,
      { leagueId: event.data.leagueId },
    );
  },
);

/**
 * Scheduled auto-start. Stale-timer safe: reschedules/cancellations change
 * league.draftScheduledAt, so an old timer's ISO no longer matches and it no-ops.
 */
export const draftScheduledStart = inngest.createFunction(
  { id: "draft-scheduled-start", triggers: { event: "draft/schedule.set" } },
  async ({ event, step }) => {
    await step.sleepUntil("until-start", event.data.scheduledAt);
    const outcome = await step.run("start-if-still-scheduled", async () => {
      const league = await db.league.findUnique({
        where: { id: event.data.leagueId },
        include: { draft: { select: { id: true } } },
      });
      if (!league || league.draft) return "noop";
      if (league.draftScheduledAt?.toISOString() !== event.data.scheduledAt) return "noop";
      try {
        await startDraftForLeague(db, { leagueId: league.id });
        return "started";
      } catch (err) {
        // A concurrent timer/human start winning the race is success, not a failure to report.
        if (err instanceof DraftAlreadyStartedError) return "noop";
        if (err instanceof DomainError) return `blocked:${err.message}`;
        throw err;
      }
    });
    if (outcome === "started") {
      await step.run("announce", () => announceDraftState(db, event.data.leagueId));
      return;
    }
    if (typeof outcome === "string" && outcome.startsWith("blocked:")) {
      // Couldn't start (too few teams, thin pool) — tell the commissioner instead of retrying.
      const loaded = await step.run("load-commissioner", async () => {
        const commish = await db.membership.findFirstOrThrow({
          where: { leagueId: event.data.leagueId, role: "COMMISSIONER" },
          include: { league: { select: { name: true } } },
        });
        return {
          recipient: await loadRecipient(db, commish.userId),
          leagueName: commish.league.name,
        };
      });
      const notification = {
        subject: `${loaded.leagueName}: the scheduled draft couldn't start`,
        text: `${outcome.slice("blocked:".length)}\n\nFix it up and start the draft from your league page: ${APP_URL}/leagues/${event.data.leagueId}`,
        url: `${APP_URL}/leagues/${event.data.leagueId}`,
      };
      for (const channel of channelsFor(loaded.recipient)) {
        await step.run(`notify-commissioner-${channel}`, () =>
          notifyVia(db, channel, loaded.recipient, notification),
        );
      }
    }
  },
);

/**
 * Live sync: every 2 minutes, but only does work while a game is (or should be)
 * underway — cost stays flat when nothing is happening.
 */
export const statsSyncLive = inngest.createFunction(
  { id: "stats-sync-live", triggers: { cron: "*/2 * * * *" } },
  async ({ step }) => {
    const activeWeeks = await step.run("find-active-weeks", async () => {
      const games = await db.nflGame.findMany({
        where: {
          season: CURRENT_SEASON,
          OR: [
            { state: "IN_PROGRESS" },
            { state: "SCHEDULED", startsAt: { lte: new Date() } },
          ],
        },
        select: { week: true },
      });
      return [...new Set(games.map((g) => g.week))];
    });
    if (activeWeeks.length === 0) return { skipped: true };
    for (const week of activeWeeks) {
      await step.run(`sync-week-${week}`, () =>
        syncWeekStats(db, espnProvider, { season: CURRENT_SEASON, week }),
      );
    }
    return { skipped: false, weeks: activeWeeks };
  },
);

/** Daily full sync: refreshes schedules/state for every playoff week (6am ET). */
export const statsSyncDaily = inngest.createFunction(
  { id: "stats-sync-daily", triggers: { cron: "TZ=America/New_York 0 6 * * *" } },
  async ({ step }) => {
    for (const week of Object.values(PLAYOFF_WEEKS)) {
      await step.run(`sync-week-${week}`, () =>
        syncWeekStats(db, espnProvider, { season: CURRENT_SEASON, week }),
      );
    }
    await step.run("sync-odds", async () => {
      if (!oddsProvider) {
        console.warn("[odds] ODDS_API_KEY not set — skipping odds sync");
        return { skipped: true };
      }
      // Odds are non-critical by design (projections fall back to 0.5 without
      // them), so a provider failure must not fail the whole daily sync run.
      try {
        return await syncTeamOdds(db, oddsProvider, { season: CURRENT_SEASON });
      } catch (err) {
        console.error("[odds] sync failed", err);
        return { skipped: true, error: String(err) };
      }
    });
    return { weeks: Object.values(PLAYOFF_WEEKS) };
  },
);

/**
 * Hourly engagement dispatcher: finds leagues owed a recap (week fully FINAL) or a
 * preview (games within 48h) and fans out one event per league × week. Watermarks
 * (lastRecapWeek/lastPreviewWeek) live on the league, so re-running is cheap and safe.
 */
export const engagementCron = inngest.createFunction(
  { id: "engagement-cron", triggers: { cron: "0 * * * *" } },
  async ({ step }) => {
    const dueRecaps = await step.run("find-recaps", () => findDueRecaps(db));
    const duePreviews = await step.run("find-previews", () => findDuePreviews(db));
    for (const { leagueId, week } of dueRecaps) {
      await step.sendEvent(`recap-${leagueId}-w${week}`, {
        name: "league/recap.due",
        data: { leagueId, week },
      });
    }
    for (const { leagueId, week } of duePreviews) {
      await step.sendEvent(`preview-${leagueId}-w${week}`, {
        name: "league/preview.due",
        data: { leagueId, week },
      });
    }
    return { recaps: dueRecaps.length, previews: duePreviews.length };
  },
);

const WEEK_NAMES: Record<number, string> = {
  1: "Wild Card",
  2: "Divisional",
  3: "Conference",
  4: "Super Bowl",
};

function movementFor(rank: number, prevRank: number): string {
  const delta = prevRank - rank;
  if (delta > 0) return `↑${delta}`;
  if (delta < 0) return `↓${-delta}`;
  return "→";
}

/** Weekly recap to every member — claim the watermark first, then one step per member × channel. */
export const sendLeagueRecap = inngest.createFunction(
  { id: "league-send-recap", triggers: { event: "league/recap.due" } },
  async ({ event, step }) => {
    const { leagueId, week } = event.data;
    const claimed = await step.run("claim-watermark", async () => {
      // Bump-first is deliberate: a crashed run loses at most one recap; the
      // alternative — bump-last — double-sends on every retry storm.
      const updated = await db.league.updateMany({
        where: { id: leagueId, lastRecapWeek: { lt: week } },
        data: { lastRecapWeek: week },
      });
      return updated.count === 1;
    });
    if (!claimed) return { skipped: true };

    const loaded = await step.run("build", async () => {
      const scores = await getLeagueScores(db, leagueId);
      const recap = buildWeeklyRecap(scores, week);
      const memberships = await db.membership.findMany({
        where: { leagueId },
        include: { league: { select: { name: true } } },
      });
      const recipients = [];
      for (const m of memberships) {
        // (leagueId, userId) is unique on Membership, so this is one recipient per member.
        recipients.push(await loadRecipient(db, m.userId));
      }
      return { recap, leagueName: memberships[0]?.league.name ?? "your league", recipients };
    });

    const { recap, leagueName, recipients } = loaded;
    const weekName = WEEK_NAMES[week] ?? `Week ${week}`;
    const standingsUrl = `${APP_URL}/leagues/${leagueId}`;
    const standings = recap.entries
      .slice(0, 5)
      .map(
        (e) =>
          `${e.rank}. ${e.name} — ${roundPoints(e.totalThroughWeek)} (${movementFor(e.rank, e.prevRank)}, ${roundPoints(e.weekPoints)} this week)`,
      )
      .join("\n");
    const notification = {
      subject: `${leagueName}: ${weekName} recap`,
      text: [
        `Top score: ${recap.topPerformer.name} — ${roundPoints(recap.topPerformer.weekPoints)}`,
        standings,
        `Full standings: ${standingsUrl}`,
      ].join("\n\n"),
      smsText: `${leagueName} ${weekName} recap: top score ${recap.topPerformer.name} (${roundPoints(recap.topPerformer.weekPoints)}). ${standingsUrl}`,
      url: standingsUrl,
    };
    for (const recipient of recipients) {
      for (const channel of channelsFor(recipient)) {
        await step.run(`send-${recipient.userId}-${channel}`, () =>
          notifyVia(db, channel, recipient, notification),
        );
      }
    }
    return { skipped: false, week, recipients: recipients.length };
  },
);

/** One league's pre-weekend preview: each member's alive players in the upcoming week. */
export const sendLeaguePreview = inngest.createFunction(
  { id: "league-send-preview", triggers: { event: "league/preview.due" } },
  async ({ event, step }) => {
    const { leagueId, week } = event.data;
    const claimed = await step.run("claim-watermark", async () => {
      // Bump-first is deliberate: a crashed run loses at most one preview; the
      // alternative — bump-last — double-sends on every retry storm.
      const updated = await db.league.updateMany({
        where: { id: leagueId, lastPreviewWeek: { lt: week } },
        data: { lastPreviewWeek: week },
      });
      return updated.count === 1;
    });
    if (!claimed) return { skipped: true };

    const loaded = await step.run("build", async () => {
      const league = await db.league.findUniqueOrThrow({
        where: { id: leagueId },
        include: {
          memberships: true,
          entries: {
            include: {
              membership: { select: { userId: true } },
              picks: { include: { player: { select: { name: true, position: true, nflTeam: true } } } },
              substitutions: {
                select: {
                  originalPlayerId: true,
                  substitutePlayerId: true,
                  effectiveWeek: true,
                  substitutePlayer: { select: { name: true, position: true, nflTeam: true } },
                },
              },
            },
          },
        },
      });
      const eliminated = await getEliminatedTeams(db, league.season);
      const perUser = new Map<string, string[]>(); // userId → alive player labels, across all their entries
      for (const entry of league.entries) {
        // Resolve substitutions so the preview matches the leaderboard's roster for this week.
        const playerById = new Map(entry.picks.map((p) => [p.playerId, p.player]));
        for (const sub of entry.substitutions) {
          playerById.set(sub.substitutePlayerId, sub.substitutePlayer);
        }
        const subsByOriginal = new Map(
          entry.substitutions.map((s) => [
            s.originalPlayerId,
            { substitutePlayerId: s.substitutePlayerId, effectiveWeek: s.effectiveWeek },
          ]),
        );
        const labels = entry.picks
          .map((pick) => playerById.get(effectivePlayerForWeek(pick, week, subsByOriginal))!)
          .filter((player) => !eliminated.has(player.nflTeam))
          .map((player) => `${player.name} (${player.position}, ${player.nflTeam})`);
        const existing = perUser.get(entry.membership.userId) ?? [];
        perUser.set(entry.membership.userId, [...existing, ...labels]);
      }
      const recipients = [];
      for (const m of league.memberships) {
        // (leagueId, userId) is unique on Membership, so this is one recipient per
        // member — including members with no alive players (they get the chaos line).
        recipients.push({
          userId: m.userId,
          players: [...new Set(perUser.get(m.userId) ?? [])],
          recipient: await loadRecipient(db, m.userId),
        });
      }
      return { leagueName: league.name, recipients };
    });

    const weekName = WEEK_NAMES[week] ?? `Week ${week}`;
    const url = `${APP_URL}/leagues/${leagueId}`;
    for (const { userId, players, recipient } of loaded.recipients) {
      const notification = {
        subject: `${loaded.leagueName}: your players this ${weekName} weekend`,
        text: [
          players.length > 0
            ? `You have ${players.length} player${players.length === 1 ? "" : "s"} alive this week:\n${players.join("\n")}`
            : "None of your players are still alive — root for chaos.",
          `Leaderboard: ${url}`,
        ].join("\n\n"),
        smsText: `${loaded.leagueName}: ${players.length} of your players play this ${weekName} weekend. ${url}`,
        url,
      };
      for (const channel of channelsFor(recipient)) {
        await step.run(`send-${userId}-${channel}`, () =>
          notifyVia(db, channel, recipient, notification),
        );
      }
    }
    return { skipped: false, week, recipients: loaded.recipients.length };
  },
);

export const functions = [draftPickClock, notifyOnTheClock, notifyDraftComplete, draftScheduledStart, statsSyncLive, statsSyncDaily, engagementCron, sendLeagueRecap, sendLeaguePreview];
