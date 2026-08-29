"use client";

import type { DraftState } from "@/lib/draft-state";

type ActiveState = Extract<DraftState, { status: "ACTIVE" | "COMPLETE" }>;

/** Grid: one column per entry (round-1 order), one row per round; snake fills right-to-left on odd rounds. */
export function DraftBoard({ state }: { state: ActiveState }) {
  const entryCount = state.order.length;
  const rounds = state.totalPicks / entryCount;
  const pickByIndex = new Map(state.picks.map((p) => [p.pickIndex, p]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left text-chalk-dim">Rd</th>
            {state.order.map((e) => (
              <th
                key={e.entryId}
                className={`p-2 text-left ${e.entryId === state.onClockEntryId ? "text-chalk-mint" : ""}`}
              >
                {e.name}
                <div className="font-normal text-chalk-dim">{e.ownerName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, round) => (
            <tr key={round} className="border-t border-chalk-line">
              <td className="p-2 text-chalk-dim">{round + 1}</td>
              {state.order.map((e, col) => {
                const withinRound = round % 2 === 0 ? col : entryCount - 1 - col;
                const pickIndex = round * entryCount + withinRound;
                const pick = pickByIndex.get(pickIndex);
                const isCurrent = state.status === "ACTIVE" && pickIndex === state.currentPickIndex;
                return (
                  <td key={e.entryId} className={`p-2 ${isCurrent ? "rounded border-2 border-chalk-coral" : ""}`}>
                    {pick ? (
                      <div data-testid="board-pick">
                        <span className="font-medium">{pick.playerName}</span>
                        <span className="ml-1 text-chalk-dim">
                          {pick.position} · {pick.nflTeam}
                          {pick.autodrafted && " · auto"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-chalk-dim">{isCurrent ? "on the clock" : `#${pickIndex + 1}`}</span>
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
