"use client";

import { useState } from "react";
import type { ScoringSettings } from "@/domain/league-settings";

interface Props {
  leagueId: string;
  isPremium: boolean;
  initial: {
    scoringPreset: string;
    scoring: ScoringSettings;
    entryFeeCents: number | null;
    venmoHandle: string | null;
  };
  duesInterestJoined: boolean;
}

const PRESETS = [
  { value: "standard", label: "Standard" },
  { value: "half_ppr", label: "Half PPR" },
  { value: "full_ppr", label: "Full PPR" },
] as const;

// Human labels for the custom grid, grouped for scanability.
const SCORING_GROUPS: { title: string; fields: [keyof ScoringSettings, string][] }[] = [
  {
    title: "Passing",
    fields: [["passYardsPerPoint", "Yards per point"], ["passTd", "TD"], ["passInt", "INT"]],
  },
  {
    title: "Rushing / Receiving",
    fields: [
      ["rushYardsPerPoint", "Rush yds/pt"], ["rushTd", "Rush TD"],
      ["recYardsPerPoint", "Rec yds/pt"], ["recTd", "Rec TD"], ["ppr", "Per reception"],
    ],
  },
  {
    title: "Kicking",
    fields: [
      ["fg0_19", "FG 0–19"], ["fg20_29", "FG 20–29"], ["fg30_39", "FG 30–39"],
      ["fg40_49", "FG 40–49"], ["fg50Plus", "FG 50+"], ["fgMiss", "FG miss"],
      ["xpMade", "XP"], ["xpMiss", "XP miss"],
    ],
  },
  {
    title: "Defense",
    fields: [
      ["sack", "Sack"], ["defInt", "INT"], ["fumRec", "Fumble rec"], ["dstTd", "DST TD"],
      ["safety", "Safety"], ["block", "Block"],
      ["pa0", "0 PA"], ["pa1_6", "1–6 PA"], ["pa7_13", "7–13 PA"], ["pa14_20", "14–20 PA"],
      ["pa21_27", "21–27 PA"], ["pa28_34", "28–34 PA"], ["pa35Plus", "35+ PA"],
    ],
  },
  {
    title: "Misc",
    fields: [["twoPtConv", "2-pt conv"], ["fumbleLost", "Fumble lost"], ["returnTd", "Return TD"]],
  },
];

export function LeagueSettingsForm({ leagueId, isPremium, initial, duesInterestJoined }: Props) {
  const [preset, setPreset] = useState(initial.scoringPreset);
  const [scoring, setScoring] = useState<ScoringSettings>(initial.scoring);
  const [customized, setCustomized] = useState(false);
  const [fee, setFee] = useState(initial.entryFeeCents !== null ? String(initial.entryFeeCents / 100) : "");
  const [venmo, setVenmo] = useState(initial.venmoHandle ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interestJoined, setInterestJoined] = useState(duesInterestJoined);
  const [interestBusy, setInterestBusy] = useState(false);

  function setScoringField(key: keyof ScoringSettings, value: number) {
    setScoring((s) => ({ ...s, [key]: value }));
    setCustomized(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const feeCents = fee.trim() === "" ? null : Math.round(Number(fee) * 100);
    if (feeCents !== null && (!Number.isFinite(feeCents) || feeCents < 0)) {
      setError("Entry fee must be a dollar amount.");
      setBusy(false);
      return;
    }
    const body: Record<string, unknown> = {
      entryFeeCents: feeCents,
      venmoHandle: venmo.trim() === "" ? null : venmo.trim(),
    };
    if (customized && isPremium) body.scoring = scoring;
    else if (preset !== initial.scoringPreset && preset !== "custom") body.scoringPreset = preset;
    try {
      const res = await fetch(`/api/leagues/${leagueId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        setCustomized(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    setInterestBusy(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/dues-interest`, { method: "POST" });
      if (res.ok) setInterestJoined(true);
    } finally {
      setInterestBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="font-semibold">Scoring</h2>
        <p className="mt-1 text-sm text-gray-500">
          Changes apply to all weeks immediately — standings recompute from raw stats.
        </p>
        <div className="mt-2 flex gap-3">
          {PRESETS.map((p) => (
            <label key={p.value} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="preset"
                checked={preset === p.value && !customized}
                onChange={() => {
                  setPreset(p.value);
                  setCustomized(false);
                }}
              />
              {p.label}
            </label>
          ))}
          {(preset === "custom" || customized) && (
            <span className="text-sm font-medium text-amber-700">Custom</span>
          )}
        </div>
        <div className={`mt-4 ${isPremium ? "" : "pointer-events-none opacity-50"}`}>
          {SCORING_GROUPS.map((group) => (
            <fieldset key={group.title} className="mt-3">
              <legend className="text-sm font-medium text-gray-600">{group.title}</legend>
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {group.fields.map(([key, label]) => (
                  <label key={key} className="flex flex-col text-xs text-gray-500">
                    {label}
                    <input
                      type="number"
                      step="any"
                      value={scoring[key]}
                      onChange={(e) => setScoringField(key, Number(e.target.value))}
                      disabled={!isPremium}
                      className="rounded border px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {!isPremium && (
          <p className="mt-2 text-sm text-amber-700">
            Editing individual values is a Premium feature — presets are free.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Dues (handled outside the app)</h2>
        <p className="mt-1 text-sm text-gray-500">
          We never touch the money — this just helps you track who&apos;s paid.
        </p>
        <div className="mt-2 flex gap-4">
          <label className="flex flex-col text-sm text-gray-600">
            Entry fee ($)
            <input
              type="number"
              min="0"
              step="1"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="50"
              className="w-28 rounded-lg border px-3 py-2 text-gray-900"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-600">
            Venmo handle
            <input
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
              placeholder="your-venmo"
              className="w-48 rounded-lg border px-3 py-2 text-gray-900"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-dashed p-4">
        <h2 className="font-semibold">Automatic dues collection</h2>
        <p className="mt-1 text-sm text-gray-600">
          We collect buy-ins and handle payouts for you — $1 per entry. Coming for the 2027 season.
        </p>
        {interestJoined ? (
          <p className="mt-2 text-sm font-medium text-green-700">You&apos;re on the waitlist.</p>
        ) : (
          <button
            type="button"
            onClick={() => void joinWaitlist()}
            disabled={interestBusy}
            className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Join the waitlist
          </button>
        )}
      </section>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save settings"}
      </button>
      {saved && <p className="text-sm text-green-700">Saved.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
