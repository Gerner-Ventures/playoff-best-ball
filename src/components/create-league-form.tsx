"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  { value: "standard", label: "Standard (no PPR)" },
  { value: "half_ppr", label: "Half PPR (0.5 pts/reception)" },
  { value: "full_ppr", label: "Full PPR (1 pt/reception)" },
] as const;

const CLOCKS = [
  { value: 2, label: "2 hours — fast draft" },
  { value: 4, label: "4 hours" },
  { value: 8, label: "8 hours — recommended" },
  { value: 24, label: "24 hours — very casual" },
] as const;

export function CreateLeagueForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [preset, setPreset] = useState<string>("half_ppr");
  const [clock, setClock] = useState<number>(8);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, teamName, scoringPreset: preset, pickClockHours: clock }),
      });
      if (res.ok) {
        const { leagueId } = await res.json();
        router.push(`/leagues/${leagueId}`);
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
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="font-medium">League name</span>
        <input
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Gerner Invitational"
          className="rounded-lg border px-4 py-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Your team name</span>
        <input
          required
          maxLength={40}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team Nick"
          className="rounded-lg border px-4 py-3"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Scoring</legend>
        {PRESETS.map((p) => (
          <label key={p.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="preset"
              checked={preset === p.value}
              onChange={() => setPreset(p.value)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Draft pick clock</legend>
        {CLOCKS.map((c) => (
          <label key={c.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="clock"
              checked={clock === c.value}
              onChange={() => setClock(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create league"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
