"use client";

import { useState } from "react";

export function UpgradeButton({ leagueId }: { leagueId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setError(null);
    let navigating = false;
    try {
      const res = await fetch(`/api/leagues/${leagueId}/upgrade`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) {
        navigating = true;
        window.location.assign(body.url); // busy stays true; the page is leaving
        return;
      }
      setError(body.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={upgrade}
        disabled={busy}
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "One sec…" : "Upgrade to Premium — $25"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
