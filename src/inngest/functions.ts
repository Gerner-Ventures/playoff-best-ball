import { NonRetriableError } from "inngest";
import { db } from "@/lib/db";

const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
import { inngest } from "@/lib/inngest";
import { channelsFor, loadRecipient, notifyVia } from "@/lib/notify";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { announceDraftState } from "@/lib/draft-events";

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
      return { recipients, leagueName: memberships[0]?.league.name ?? "your league" };
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
  },
);

export const functions = [draftPickClock, notifyOnTheClock, notifyDraftComplete];
