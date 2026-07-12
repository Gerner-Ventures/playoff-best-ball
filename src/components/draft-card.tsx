"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function DraftCard({
  leagueId,
  isCommissioner,
  draftStatus, // "NOT_STARTED" | "ACTIVE" | "COMPLETE"
  entryCount,
  draftScheduledAt,
}: {
  leagueId: string;
  isCommissioner: boolean;
  draftStatus: "NOT_STARTED" | "ACTIVE" | "COMPLETE";
  entryCount: number;
  draftScheduledAt: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(draftScheduledAt);
  const [scheduleInput, setScheduleInput] = useState("");
  const [busySchedule, setBusySchedule] = useState(false);

  async function patchSchedule(value: string | null) {
    setBusySchedule(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft/schedule`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduledAt: value }),
      });
      if (res.ok) {
        const body = await res.json();
        setScheduledAt(body.draftScheduledAt);
        if (!body.draftScheduledAt) setScheduleInput("");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusySchedule(false);
    }
  }

  const saveSchedule = () => {
    if (Number.isNaN(new Date(scheduleInput).getTime())) {
      setError("Invalid date and time. Please select a valid date.");
      return;
    }
    void patchSchedule(new Date(scheduleInput).toISOString());
  };
  const clearSchedule = () => void patchSchedule(null);

  async function start() {
    if (!window.confirm(`Start the draft with ${entryCount} teams? The order will be randomized and no one else can join.`)) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/draft`, { method: "POST" });
      if (res.ok) {
        router.push(`/leagues/${leagueId}/draft`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  if (draftStatus === "NOT_STARTED") {
    return (
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">Draft</h2>
        <p className="mt-1 text-sm text-gray-600">
          {isCommissioner
            ? "Once everyone's in, start the draft. Members pick on their own time and get notified on their turn."
            : "The commissioner hasn't started the draft yet. You'll get an email when you're on the clock."}
        </p>
        {isCommissioner && (
          <button
            type="button"
            onClick={start}
            disabled={starting || entryCount < 2}
            className="mt-3 rounded-lg bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start draft"}
          </button>
        )}
        {entryCount < 2 && isCommissioner && (
          <p className="mt-2 text-sm text-gray-500">You need at least 2 teams to start.</p>
        )}
        {isCommissioner && (
          <div className="mt-4 border-t pt-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Or schedule the start</span>
              <input
                type="datetime-local"
                value={scheduleInput}
                onChange={(e) => setScheduleInput(e.target.value)}
                className="rounded-lg border px-3 py-2"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={saveSchedule}
                disabled={busySchedule || scheduleInput === ""}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {busySchedule ? "Saving…" : "Schedule"}
              </button>
              {scheduledAt && (
                <button
                  type="button"
                  onClick={clearSchedule}
                  disabled={busySchedule}
                  className="rounded-lg border px-3 py-2 text-sm text-gray-500 disabled:opacity-50"
                >
                  Cancel schedule
                </button>
              )}
            </div>
          </div>
        )}
        {scheduledAt && (
          <p className="mt-2 text-sm text-gray-600">
            Draft starts automatically {new Date(scheduledAt).toLocaleString()}.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold">Draft</h2>
      <p className="mt-1 text-sm text-gray-600">
        {draftStatus === "ACTIVE" ? "The draft is live." : "The draft is complete."}
      </p>
      <Link
        href={`/leagues/${leagueId}/draft`}
        className="mt-3 inline-block rounded-lg bg-green-700 px-4 py-2 font-semibold text-white"
      >
        {draftStatus === "ACTIVE" ? "Go to draft room" : "View results"}
      </Link>
    </div>
  );
}
