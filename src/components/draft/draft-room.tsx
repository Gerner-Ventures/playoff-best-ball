"use client";

import Link from "next/link";
import { useDraftState } from "./use-draft-state";
import { Countdown } from "./countdown";
import { DraftBoard } from "./draft-board";
import { PickPanel } from "./pick-panel";

export function DraftRoom({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const { state, error, refetch } = useDraftState(leagueId);

  if (error) return <p className="p-6 text-chalk-coral">{error}</p>;
  if (!state) return <p className="p-6 text-chalk-dim">Loading draft…</p>;
  if (state.status === "NOT_STARTED") {
    return <p className="p-6 text-chalk-dim">The draft hasn&apos;t started yet.</p>;
  }

  const onClock = state.order.find((e) => e.entryId === state.onClockEntryId);
  const myTurn = state.status === "ACTIVE" && state.onClockEntryId === state.myEntryId;

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="chalk chalk-h1 text-4xl sm:text-5xl">{leagueName} — Draft</h1>
      {state.status === "ACTIVE" && state.deadline && onClock && (
        <div
          data-testid="turn-banner"
          className={`mt-3 chalk-card chalk-card-accent p-3 ${myTurn ? "border-chalk-coral text-chalk-coral" : "text-chalk-soft"}`}
        >
          {myTurn ? (
            <span className="font-semibold">
              You&apos;re on the clock — <Countdown deadline={state.deadline} /> left
            </span>
          ) : (
            <span>
              {onClock.name} ({onClock.ownerName}) is on the clock — <Countdown deadline={state.deadline} /> left
            </span>
          )}
        </div>
      )}
      {state.status === "ACTIVE" && (
        <p className="mt-2 text-sm">
          <Link href="/settings/notifications" className="text-chalk-dim underline">
            Get texted or pinged when you&apos;re on the clock →
          </Link>
        </p>
      )}
      {state.status === "COMPLETE" && (
        <p className="mt-3 rounded-lg p-3 text-chalk-soft">The draft is complete.</p>
      )}
      <div className="mt-6">
        <DraftBoard state={state} />
      </div>
      <PickPanel state={state} leagueId={leagueId} onPicked={() => void refetch()} />
    </div>
  );
}
