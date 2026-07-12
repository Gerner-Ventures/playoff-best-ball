"use client";

import { useState } from "react";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function AdminPanel() {
  const [teams, setTeams] = useState("");
  const [week, setWeek] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; data: unknown }>) {
    setBusy(true);
    setError(null);
    setResult(null);
    setUnmatched([]);
    try {
      const { ok, data } = await action();
      if (ok) {
        const d = data as { created?: number; updated?: number; games?: number; statLines?: number; unmatched?: string[] };
        setResult(JSON.stringify({ ...d, unmatched: undefined }));
        setUnmatched(d.unmatched ?? []);
      } else {
        setError((data as { error?: string }).error ?? "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Sync player pool</h2>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Playoff team abbreviations (comma-separated)</span>
          <textarea
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
            placeholder="KC, BUF, BAL, PHI, DET, LAR, ..."
            rows={2}
            className="rounded-lg border px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy || teams.trim() === ""}
          onClick={() =>
            void run(() =>
              postJson("/api/admin/sync/pool", {
                teams: teams.split(",").map((t) => t.trim()).filter(Boolean),
              }),
            )
          }
          className="mt-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync pool"}
        </button>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Sync week stats</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-gray-600">Week (1=WC … 4=SB)</span>
          <input
            type="number"
            min={1}
            max={4}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="w-20 rounded-lg border px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => postJson("/api/admin/sync/week", { week }))}
          className="mt-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Sync week"}
        </button>
      </section>

      {result && <p className="text-sm text-gray-700">{result}</p>}
      {unmatched.length > 0 && (
        <div className="text-sm text-red-600">
          <p className="font-medium">Unmatched stat lines ({unmatched.length}) — run a pool sync:</p>
          <ul className="mt-1 list-inside list-disc">
            {unmatched.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
