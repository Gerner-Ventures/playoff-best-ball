"use client";

import type { DraftState } from "@/lib/draft-state";
import { PositionChip } from "@/components/position-chip";

type ActiveState = Extract<DraftState, { status: "ACTIVE" | "COMPLETE" }>;

/**
 * Grid: one column per entry (round-1 order), one row per round; snake fills
 * right-to-left on odd rounds.
 *
 * A board is a matrix — it cannot stack into cards on a phone without losing the
 * snake shape, which is the one thing it exists to show. So the mobile treatment
 * is a sticky round column plus horizontal scroll: you always know which round
 * you are looking at, however far across you have scrolled.
 *
 * `border-separate` rather than `border-collapse`: collapsed borders do not stick
 * with the sticky column, so the rules are drawn on the cells instead.
 */
export function DraftBoard({ state }: { state: ActiveState }) {
  const entryCount = state.order.length;
  const rounds = state.totalPicks / entryCount;
  const pickByIndex = new Map(state.picks.map((p) => [p.pickIndex, p]));

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-rule bg-surface p-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted md:p-1.5">
              Rd
            </th>
            {state.order.map((e) => {
              const isOnClock = e.entryId === state.onClockEntryId;
              return (
                <th key={e.entryId} className="border-b border-rule p-2 text-left align-bottom md:p-1.5">
                  <div className={`font-semibold ${isOnClock ? "text-brand" : "text-ink"}`}>{e.name}</div>
                  <div className="font-normal text-ink-muted">{e.ownerName}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, round) => (
            <tr key={round}>
              <td className="sticky left-0 z-10 border-t border-rule bg-surface p-2 tabular text-ink-muted md:p-1.5">
                {round + 1}
              </td>
              {state.order.map((e, col) => {
                const withinRound = round % 2 === 0 ? col : entryCount - 1 - col;
                const pickIndex = round * entryCount + withinRound;
                const pick = pickByIndex.get(pickIndex);
                const isCurrent = state.status === "ACTIVE" && pickIndex === state.currentPickIndex;
                return (
                  <td
                    key={e.entryId}
                    className={`border-t border-rule p-2 align-top md:p-1.5 ${isCurrent ? "on-clock" : ""}`}
                  >
                    {pick ? (
                      <div data-testid="board-pick" className="flex flex-col gap-1">
                        <span className="font-medium text-ink">{pick.playerName}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                          <PositionChip position={pick.position} />
                          {pick.nflTeam}
                          {pick.autodrafted && <span>· auto</span>}
                        </span>
                      </div>
                    ) : isCurrent ? (
                      <span className="tabular text-xs font-semibold uppercase tracking-wider text-brand">
                        On the clock
                      </span>
                    ) : (
                      <span className="tabular text-ink-muted">#{pickIndex + 1}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
