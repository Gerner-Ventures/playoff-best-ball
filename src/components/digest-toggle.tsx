"use client";

import { useState } from "react";

/** Saves on change. This page is still chalk-styled, so it uses chalk tokens until the app converts. */
export function DigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    const previous = on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/digest", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ digest: next }),
      });
      if (res.ok) {
        setOn((await res.json()).digest);
      } else {
        setOn(previous);
        setError("Couldn't save that. Try again.");
      }
    } catch {
      setOn(previous);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={on}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Weekly playoff-race digest</span>
          <span className="block text-sm text-chalk-dim">
            One email a week through the regular season, plus a heads-up when leagues open.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-chalk-coral">
          {error}
        </p>
      )}
    </div>
  );
}
