"use client";

import Link from "next/link";
import { useDraftState } from "./use-draft-state";
import { Countdown } from "./countdown";
import { DraftBoard } from "./draft-board";
import { PickPanel } from "./pick-panel";

export function DraftRoom({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const { state, error, refetch } = useDraftState(leagueId);

  if (error) return <p className="p-6 text-warn">{error}</p>;
  if (!state) return <p className="p-6 text-ink-muted">Loading draft…</p>;
  if (state.status === "NOT_STARTED") {
    return <p className="p-6 text-ink-muted">The draft hasn&apos;t started yet.</p>;
  }

  const onClock = state.order.find((e) => e.entryId === state.onClockEntryId);
  const myTurn = state.status === "ACTIVE" && state.onClockEntryId === state.myEntryId;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{leagueName} — Draft</h1>
        <p className="tabular text-sm text-ink-muted">
          Pick {state.currentPickIndex + 1} of {state.totalPicks}
        </p>
      </div>

      {/*
        The emotional beat of the whole product. Brand colour appears here and on
        controls, nowhere else — which is what makes "you're up" readable across
        the room rather than just another row of text.
      */}
      {state.status === "ACTIVE" && state.deadline && onClock && (
        <div
          data-testid="turn-banner"
          className={`card mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:p-5 ${
            myTurn ? "on-clock" : ""
          }`}
        >
          {/*
            "You're on the clock" is load-bearing text, not decoration: it is the
            phrase the notifications and the settings link both use, and
            draft-happy-path.spec.ts reads it out of this banner to decide whose
            turn it is. Keep the wording.
          */}
          <div>
            {myTurn ? (
              <p className="text-xl font-semibold text-brand">You&apos;re on the clock</p>
            ) : (
              <>
                <p className="text-lg font-semibold text-ink">
                  {onClock.name} <span className="font-normal text-ink-muted">is on the clock</span>
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{onClock.ownerName}</p>
              </>
            )}
          </div>
          <div className="text-right">
            <p className={`tabular text-2xl font-semibold ${myTurn ? "text-brand" : "text-ink"}`}>
              <Countdown deadline={state.deadline} />
            </p>
            <p className="text-xs text-ink-muted">left to pick</p>
          </div>
        </div>
      )}

      {state.status === "ACTIVE" && (
        <p className="mt-2 text-sm">
          <Link href="/settings/notifications" className="text-ink-muted underline hover:text-ink">
            Get texted or pinged when you&apos;re on the clock →
          </Link>
        </p>
      )}

      {state.status === "COMPLETE" && (
        <div className="card mt-4 p-4 sm:p-5">
          <p className="tabular text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Draft
          </p>
          <p className="mt-1 text-lg font-semibold text-ink">Complete</p>
        </div>
      )}

      <div className="mt-6">
        <DraftBoard state={state} />
      </div>
      <PickPanel state={state} leagueId={leagueId} onPicked={() => void refetch()} />
    </div>
  );
}
