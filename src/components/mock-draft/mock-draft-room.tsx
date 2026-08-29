"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ROSTER_SLOTS } from "@/domain/league-settings";

type Player = { id: string; name: string; position: string; nflTeam: string };
type Slot = { slotIndex: number; slot: string; player: Player | null };
type Pick = { pickIndex: number; seat: string; slotIndex: number; player: Player | null };

interface State {
  status: "ACTIVE" | "COMPLETE";
  humanSeat: string;
  order: string[];
  teamCount: number;
  currentPickIndex: number;
  totalPicks: number;
  onTheClock: string | null;
  picks: Pick[];
  myRoster: Slot[];
  available: Player[];
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"] as const;

export function MockDraftRoom() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState(10);
  const [filter, setFilter] = useState<(typeof POSITIONS)[number]>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mock-draft");
      setState(res.ok ? await res.json() : null);
      setLoading(false);
    })();
  }, []);

  const send = useCallback(async (url: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong.");
        return;
      }
      setState(body);
    } finally {
      setBusy(false);
    }
  }, []);

  const start = () =>
    send("/api/mock-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamCount, rosterSlots: DEFAULT_ROSTER_SLOTS }),
    });

  const pick = (playerId: string) =>
    send("/api/mock-draft/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });

  const quit = async () => {
    setBusy(true);
    await fetch("/api/mock-draft", { method: "DELETE" });
    setState(null);
    setBusy(false);
  };

  if (loading) return <p className="text-chalk-dim">Loading…</p>;

  if (!state) {
    return (
      <div className="chalk-card flex max-w-md flex-col gap-5 p-7">
        <h2 className="chalk chalk-h2 text-3xl text-chalk-mint">New mock draft</h2>
        <p className="text-chalk-soft">
          Draft against bots at your own pace. Nothing here counts — it&apos;s practice.
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-chalk-dim">Teams</span>
          <select
            value={teamCount}
            onChange={(e) => setTeamCount(Number(e.target.value))}
            className="chalk-input"
          >
            {Array.from({ length: 24 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{n} teams</option>
            ))}
          </select>
        </label>
        <p className="text-sm text-chalk-dim">
          Standard {DEFAULT_ROSTER_SLOTS.length}-slot roster:{" "}
          {DEFAULT_ROSTER_SLOTS.map((s) => s.slot).join(" · ")}
        </p>
        {error && <p className="text-chalk-coral">{error}</p>}
        <button onClick={start} disabled={busy} className="chalk-btn chalk-btn-primary self-start">
          Start mock draft
        </button>
      </div>
    );
  }

  const myTurn = state.status === "ACTIVE" && state.onTheClock === state.humanSeat;
  const round = Math.floor(state.currentPickIndex / state.teamCount) + 1;
  const visible = state.available
    .filter((p) => filter === "ALL" || p.position === filter)
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 60);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          className={`chalk-card chalk-card-accent px-5 py-3 ${
            myTurn ? "chalk-card-coral text-chalk-coral" : "text-chalk-soft"
          }`}
        >
          {state.status === "COMPLETE" ? (
            <span className="font-chalk text-2xl font-bold">That&apos;s a wrap — draft complete</span>
          ) : myTurn ? (
            <span className="font-chalk text-2xl font-bold">
              You&apos;re on the clock · round <span className="tabular">{round}</span>
            </span>
          ) : (
            <span>Bots are picking…</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-chalk-dim">
            pick <span className="tabular">{Math.min(state.currentPickIndex + 1, state.totalPicks)}</span>
            {" of "}
            <span className="tabular">{state.totalPicks}</span>
          </span>
          <button onClick={quit} disabled={busy} className="chalk-btn chalk-btn-sm">
            {state.status === "COMPLETE" ? "New mock" : "Quit"}
          </button>
        </div>
      </div>

      {error && <p className="text-chalk-coral">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="flex flex-col gap-3">
          <h2 className="chalk chalk-h2 text-3xl text-chalk-mint">My roster</h2>
          <ul className="flex flex-col gap-2">
            {state.myRoster.map((s) => (
              <li key={s.slotIndex} className="chalk-card flex items-center justify-between px-4 py-3">
                <span className="tabular text-sm text-chalk-dim">{s.slot}</span>
                {s.player ? (
                  <span className="text-chalk">
                    {s.player.name}{" "}
                    <span className="text-sm text-chalk-dim">
                      {s.player.position} · {s.player.nflTeam}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-chalk-dim">empty</span>
                )}
              </li>
            ))}
          </ul>

          <h2 className="chalk chalk-h2 mt-4 text-3xl text-chalk-lilac">Recent picks</h2>
          <ul className="flex flex-col gap-2">
            {[...state.picks].reverse().slice(0, 8).map((p) => (
              <li key={p.pickIndex} className="chalk-card flex items-center gap-4 px-4 py-2">
                <span className="tabular text-sm text-chalk-dim">
                  {Math.floor(p.pickIndex / state.teamCount) + 1}.
                  {String((p.pickIndex % state.teamCount) + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-chalk">{p.player?.name ?? "—"}</span>
                <span className="text-sm text-chalk-dim">
                  {p.seat === state.humanSeat ? "you" : `bot ${p.seat}`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="chalk chalk-h2 text-3xl text-chalk-yellow">Available</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="chalk-input"
          />
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => setFilter(pos)}
                className={`chalk-btn chalk-btn-sm ${filter === pos ? "border-chalk-mint text-chalk-mint" : ""}`}
              >
                {pos}
              </button>
            ))}
          </div>
          <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => pick(p.id)}
                  disabled={!myTurn || busy}
                  className="chalk-btn chalk-btn-between w-full"
                >
                  <span className="text-chalk">{p.name}</span>
                  <span className="text-sm text-chalk-dim">
                    {p.position} · {p.nflTeam}
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="text-chalk-dim">No players match.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
