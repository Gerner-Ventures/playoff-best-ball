"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinLeagueForm({ code }: { code: string }) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/join/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamName }),
    });
    if (res.ok) {
      const { leagueId } = await res.json();
      router.push(`/leagues/${leagueId}`);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="teamName" className="sr-only">Your team name</label>
      <input
        id="teamName"
        required
        maxLength={40}
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="Your team name"
        className="rounded-lg border px-4 py-3"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Joining…" : "Join league"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
