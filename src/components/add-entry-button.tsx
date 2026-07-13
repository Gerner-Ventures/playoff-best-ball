"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Premium perk: members can field multiple teams until the draft starts. */
export function AddEntryButton({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamName }),
      });
      if (res.ok) {
        setTeamName("");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex gap-2">
        <label htmlFor="addEntryTeamName" className="sr-only">New team name</label>
        <input
          id="addEntryTeamName"
          required
          maxLength={40}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="New team name"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add another team"}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </form>
  );
}
