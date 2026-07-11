import { NonRetriableError } from "inngest";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { notifyUser } from "@/lib/notify";
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

/** "You're on the clock" email to the on-clock entry's owner. */
export const notifyOnTheClock = inngest.createFunction(
  { id: "draft-notify-on-the-clock", triggers: { event: "draft/turn.started" } },
  async ({ event, step }) => {
    await step.run("send", async () => {
      const entry = await db.entry.findUniqueOrThrow({
        where: { id: event.data.entryId },
        include: { membership: { include: { user: true } }, league: true },
      });
      const deadline = new Date(event.data.deadline);
      await notifyUser(entry.membership.user, {
        subject: `You're on the clock in ${entry.league.name}`,
        text: [
          `It's your pick in ${entry.league.name} (pick ${event.data.pickIndex + 1}).`,
          `Your clock runs out ${deadline.toLocaleString("en-US", { timeZone: "America/New_York" })} ET — after that we'll autodraft from your queue.`,
          `Make your pick: ${process.env.BETTER_AUTH_URL}/leagues/${event.data.leagueId}/draft`,
        ].join("\n\n"),
      });
    });
  },
);

/** Draft-complete email to every member. */
export const notifyDraftComplete = inngest.createFunction(
  { id: "draft-notify-complete", triggers: { event: "draft/completed" } },
  async ({ event, step }) => {
    await step.run("send-all", async () => {
      const memberships = await db.membership.findMany({
        where: { leagueId: event.data.leagueId },
        include: { user: true, league: true },
      });
      for (const m of memberships) {
        await notifyUser(m.user, {
          subject: `${m.league.name}: the draft is complete`,
          text: `All picks are in. See every roster: ${process.env.BETTER_AUTH_URL}/leagues/${event.data.leagueId}/draft`,
        });
      }
    });
  },
);

export const functions = [draftPickClock, notifyOnTheClock, notifyDraftComplete];
