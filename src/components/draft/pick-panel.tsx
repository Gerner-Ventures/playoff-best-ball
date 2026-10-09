"use client";

import { useEffect, useMemo, useState } from "react";
import type { DraftState } from "@/lib/draft-state";
import { PositionChip } from "@/components/position-chip";

type ActiveState = Extract<DraftState, { status: "ACTIVE" | "COMPLETE" }>;

interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  defaultRank: number;
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"] as const;

/*
 * Adaptive density, applied as utilities rather than a second component class:
 * controls keep the 44px touch floor on a phone (where picks actually get made)
 * and tighten to 36px from md up (where you are studying the board on a laptop).
 */
const DENSE = "md:min-h-9 md:px-3 md:py-1 md:text-sm";

export function PickPanel({
  state,
  leagueId,
  onPicked,
}: {
  state: ActiveState;
  leagueId: string;
  onPicked: () => void;
}) {
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [queue, setQueue] = useState<string[]>([]); // playerIds, best first
  const [filter, setFilter] = useState<(typeof POSITIONS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const takenIds = useMemo(() => new Set(state.picks.map((p) => p.playerId)), [state.picks]);
  const myTurn = state.status === "ACTIVE" && state.onClockEntryId === state.myEntryId;
  const poolById = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);

  useEffect(() => {
    void (async () => {
      try {
        const [playersRes, queueRes] = await Promise.all([
          fetch("/api/players"),
          fetch(`/api/leagues/${leagueId}/queue`),
        ]);
        if (playersRes.ok) setPool((await playersRes.json()).players);
        if (queueRes.ok) {
          const body = await queueRes.json();
          setQueue(body.queue.map((q: { playerId: string }) => q.playerId));
        }
      } catch {
        setError("Couldn't load players.");
      }
    })();
  }, [leagueId]);

  async function saveQueue(next: string[]) {
    const prev = queue;
    setQueue(next); // optimistic
    try {
      const res = await fetch(`/api/leagues/${leagueId}/queue`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerIds: next }),
      });
      if (!res.ok) {
        setQueue(prev);
        setError("Couldn't save your queue.");
      }
    } catch {
      setQueue(prev);
      setError("Couldn't save your queue.");
    }
  }

  async function draftPlayer(playerId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft/pick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Pick failed.");
      }
      onPicked(); // refetch either way — a PICK_CONFLICT means the board changed
    } catch {
      setError("Couldn't reach the server. Your pick was NOT made — try again.");
    } finally {
      setBusy(false);
    }
  }

  const visible = pool.filter(
    (p) =>
      !takenIds.has(p.id) &&
      (filter === "ALL" || p.position === filter) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function move(playerId: string, dir: -1 | 1) {
    const i = queue.indexOf(playerId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= queue.length) return;
    const next = [...queue];
    [next[i], next[j]] = [next[j], next[i]];
    void saveQueue(next);
  }

  if (state.status === "COMPLETE") return null;

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <section>
        <h2 className="text-lg font-semibold text-ink">Available players</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setFilter(pos)}
              aria-pressed={filter === pos}
              className={`btn btn-sm ${filter === pos ? "border-brand text-brand" : ""}`}
            >
              {pos}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className={`input ml-auto w-full sm:w-40 ${DENSE}`}
            aria-label="Search players"
          />
        </div>

        <ul className="card mt-3 max-h-96 overflow-y-auto">
          {visible.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 border-b border-rule p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:p-2"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <PositionChip position={p.position} />
                <span className="font-medium text-ink">{p.name}</span>
                <span className="tabular text-sm text-ink-muted">{p.nflTeam}</span>
              </span>
              <span className="flex shrink-0 gap-2">
                {!queue.includes(p.id) && (
                  <button
                    type="button"
                    onClick={() => void saveQueue([...queue, p.id])}
                    className={`btn btn-sm ${DENSE}`}
                  >
                    Queue
                  </button>
                )}
                <button
                  type="button"
                  disabled={!myTurn || busy}
                  onClick={() => void draftPlayer(p.id)}
                  className={`btn btn-primary ${DENSE}`}
                >
                  Draft
                </button>
              </span>
            </li>
          ))}
          {visible.length === 0 && <li className="p-3 text-sm text-ink-muted">No players match.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink">My queue</h2>
        <p className="mt-1 text-sm text-ink-muted">
          If your clock runs out, we draft the highest available player from this list (skipping any
          that don&apos;t fit your roster), then best-available.
        </p>

        <ul className="card mt-3">
          {queue.map((playerId, i) => {
            const p = poolById.get(playerId);
            if (!p) return null;
            const taken = takenIds.has(playerId);
            return (
              <li
                key={playerId}
                className="flex flex-col gap-2 border-b border-rule p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:p-2"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="tabular text-sm text-ink-muted">{i + 1}</span>
                  <PositionChip position={p.position} />
                  {/* Taken by someone else. The strikethrough carries the state; the
                      colour stays legible because you still need to read the name. */}
                  <span className={taken ? "is-out font-medium" : "font-medium text-ink"}>{p.name}</span>
                  <span className="tabular text-sm text-ink-muted">{p.nflTeam}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${p.name} up`}
                    onClick={() => move(playerId, -1)}
                    className={`btn btn-sm ${DENSE}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${p.name} down`}
                    onClick={() => move(playerId, 1)}
                    className={`btn btn-sm ${DENSE}`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name} from queue`}
                    onClick={() => void saveQueue(queue.filter((id) => id !== playerId))}
                    className={`btn btn-sm ${DENSE}`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
          {queue.length === 0 && <li className="p-3 text-sm text-ink-muted">Queue is empty.</li>}
        </ul>
      </section>

      {error && (
        <p role="alert" className="text-sm text-warn md:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}
