"use client";

import { useEffect, useMemo, useState } from "react";
import type { DraftState } from "@/lib/draft-state";

type ActiveState = Extract<DraftState, { status: "ACTIVE" | "COMPLETE" }>;

interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
  defaultRank: number;
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"] as const;

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
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <section>
        <h2 className="font-semibold">Available players</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setFilter(pos)}
              className={`rounded px-2 py-1 text-sm ${filter === pos ? "bg-green-700 text-white" : "border"}`}
            >
              {pos}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="ml-auto rounded-lg border px-3 py-1 text-sm"
            aria-label="Search players"
          />
        </div>
        <ul className="mt-3 max-h-96 overflow-y-auto rounded-lg border">
          {visible.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b p-2 last:border-b-0">
              <span>
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-sm text-gray-500">{p.position} · {p.nflTeam}</span>
              </span>
              <span className="flex gap-2">
                {!queue.includes(p.id) && (
                  <button
                    type="button"
                    onClick={() => void saveQueue([...queue, p.id])}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    Queue
                  </button>
                )}
                <button
                  type="button"
                  disabled={!myTurn || busy}
                  onClick={() => void draftPlayer(p.id)}
                  className="rounded bg-green-700 px-2 py-1 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Draft
                </button>
              </span>
            </li>
          ))}
          {visible.length === 0 && <li className="p-3 text-sm text-gray-500">No players match.</li>}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">My queue</h2>
        <p className="mt-1 text-sm text-gray-500">
          If your clock runs out, we draft the highest available player from this list (skipping any
          that don&apos;t fit your roster), then best-available.
        </p>
        <ul className="mt-3 rounded-lg border">
          {queue.map((playerId, i) => {
            const p = poolById.get(playerId);
            if (!p) return null;
            return (
              <li key={playerId} className="flex items-center justify-between border-b p-2 last:border-b-0">
                <span className={takenIds.has(playerId) ? "text-gray-400 line-through" : ""}>
                  {i + 1}. {p.name}{" "}
                  <span className="text-sm text-gray-500">{p.position} · {p.nflTeam}</span>
                </span>
                <span className="flex gap-1">
                  <button type="button" aria-label={`Move ${p.name} up`} onClick={() => move(playerId, -1)} className="rounded border px-2 py-1 text-sm">↑</button>
                  <button type="button" aria-label={`Move ${p.name} down`} onClick={() => move(playerId, 1)} className="rounded border px-2 py-1 text-sm">↓</button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name} from queue`}
                    onClick={() => void saveQueue(queue.filter((id) => id !== playerId))}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
          {queue.length === 0 && <li className="p-3 text-sm text-gray-500">Queue is empty.</li>}
        </ul>
      </section>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
    </div>
  );
}
