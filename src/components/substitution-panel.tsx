"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };

interface Props {
  leagueId: string;
  entryId: string;
  roster: { playerId: string; name: string; position: string }[];
  pool: { id: string; name: string; position: string }[];
  existing: { originalPlayerId: string; originalName: string; substituteName: string; effectiveWeek: number }[];
}

export function SubstitutionPanel({ leagueId, entryId, roster, pool, existing }: Props) {
  const router = useRouter();
  const [originalId, setOriginalId] = useState("");
  const [substituteId, setSubstituteId] = useState("");
  const [week, setWeek] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original = roster.find((p) => p.playerId === originalId);
  const rosteredIds = new Set(roster.map((p) => p.playerId));
  const candidates = original
    ? pool.filter((p) => p.position === original.position && !rosteredIds.has(p.id))
    : [];

  async function send(method: "PUT" | "DELETE", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/entries/${entryId}/substitution`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.refresh();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const ok = await send("PUT", {
      originalPlayerId: originalId,
      substitutePlayerId: substituteId,
      effectiveWeek: week,
      ...(reason.trim() !== "" ? { reason: reason.trim() } : {}),
    });
    if (ok) {
      setOriginalId("");
      setSubstituteId("");
      setReason("");
    }
  }

  return (
    <section className="mt-8 rounded-lg border p-4">
      <h2 className="font-semibold">Injury substitutions</h2>
      <p className="mt-1 text-sm text-gray-500">
        Swap an injured player for an undrafted one (same position); the original&apos;s points keep
        counting for earlier weeks.
      </p>
      {existing.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {existing.map((s) => (
            <li key={s.originalPlayerId} className="flex items-center justify-between rounded border px-2 py-1">
              <span>
                {s.originalName} → {s.substituteName} from {WEEK_LABELS[s.effectiveWeek] ?? `week ${s.effectiveWeek}`}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("DELETE", { originalPlayerId: s.originalPlayerId })}
                className="ml-2 rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                aria-label={`Remove substitution for ${s.originalName}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={apply} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-gray-600">
          Injured player
          <select
            value={originalId}
            onChange={(e) => {
              setOriginalId(e.target.value);
              setSubstituteId("");
            }}
            className="rounded-lg border px-3 py-2 text-gray-900"
          >
            <option value="">Choose…</option>
            {roster.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.name} ({p.position})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-gray-600">
          Substitute
          <select
            value={substituteId}
            onChange={(e) => setSubstituteId(e.target.value)}
            disabled={!original}
            className="rounded-lg border px-3 py-2 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Choose…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-gray-600">
          From week
          <select
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="rounded-lg border px-3 py-2 text-gray-900"
          >
            {[1, 2, 3, 4].map((w) => (
              <option key={w} value={w}>
                {WEEK_LABELS[w]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-gray-600">
          Reason (optional)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={80}
            placeholder="hamstring"
            className="w-36 rounded-lg border px-3 py-2 text-gray-900"
          />
        </label>
        <button
          type="submit"
          disabled={busy || originalId === "" || substituteId === ""}
          className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
