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
            <th className="p-2 text-left text-gray-500">Rd</th>
            {state.order.map((e) => (
              <th
                key={e.entryId}
                className={`p-2 text-left ${e.entryId === state.onClockEntryId ? "text-green-700" : ""}`}
              >
                {e.name}
                <div className="font-normal text-gray-500">{e.ownerName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, round) => (
            <tr key={round} className="border-t">
              <td className="p-2 text-gray-500">{round + 1}</td>
              {state.order.map((e, col) => {
                const withinRound = round % 2 === 0 ? col : entryCount - 1 - col;
                const pickIndex = round * entryCount + withinRound;
                const pick = pickByIndex.get(pickIndex);
                const isCurrent = state.status === "ACTIVE" && pickIndex === state.currentPickIndex;
                return (
                  <td key={e.entryId} className={`p-2 ${isCurrent ? "bg-green-50" : ""}`}>
                    {pick ? (
                      <div data-testid="board-pick">
                        <span className="font-medium">{pick.playerName}</span>
                        <span className="ml-1 text-gray-500">
                          {pick.position} · {pick.nflTeam}
                          {pick.autodrafted && " · auto"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-300">{isCurrent ? "on the clock" : `#${pickIndex + 1}`}</span>
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
