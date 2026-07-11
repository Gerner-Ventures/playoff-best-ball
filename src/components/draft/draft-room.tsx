"use client";

import { useDraftState } from "./use-draft-state";
import { Countdown } from "./countdown";
import { DraftBoard } from "./draft-board";

export function DraftRoom({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const { state, error, refetch } = useDraftState(leagueId);
  void refetch; // Task 16 wires this into <PickPanel onPicked>

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!state) return <p className="p-6 text-gray-500">Loading draft…</p>;
  if (state.status === "NOT_STARTED") {
    return <p className="p-6 text-gray-600">The draft hasn&apos;t started yet.</p>;
  }

  const onClock = state.order.find((e) => e.entryId === state.onClockEntryId);
  const myTurn = state.status === "ACTIVE" && state.onClockEntryId === state.myEntryId;

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="text-2xl font-bold">{leagueName} — Draft</h1>
      {state.status === "ACTIVE" && state.deadline && onClock && (
        <div
          className={`mt-3 rounded-lg p-3 ${myTurn ? "bg-green-700 text-white" : "bg-gray-100 text-gray-700"}`}
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
      {state.status === "COMPLETE" && (
        <p className="mt-3 rounded-lg bg-gray-100 p-3 text-gray-700">The draft is complete.</p>
      )}
      <div className="mt-6">
        <DraftBoard state={state} />
      </div>
      {/* Task 16 mounts <PickPanel state={state} leagueId={leagueId} onPicked={refetch} /> here */}
    </div>
  );
}
