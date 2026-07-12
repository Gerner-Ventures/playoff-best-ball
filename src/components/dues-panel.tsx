"use client";

import { useState } from "react";

interface DuesEntry {
  entryId: string;
  name: string;
  ownerName: string;
  duesPaid: boolean;
  isMine: boolean;
}

interface Props {
  leagueId: string;
  isCommissioner: boolean;
  entryFeeCents: number;
  venmoHandle: string | null;
  entries: DuesEntry[];
}

export function DuesPanel({ leagueId, isCommissioner, entryFeeCents, venmoHandle, entries }: Props) {
  const [rows, setRows] = useState(entries);
  const [error, setError] = useState<string | null>(null);
  const fee = `$${(entryFeeCents / 100).toFixed(entryFeeCents % 100 === 0 ? 0 : 2)}`;

  async function toggle(entryId: string, paid: boolean) {
    setError(null);
    const prev = rows;
    setRows((r) => r.map((e) => (e.entryId === entryId ? { ...e, duesPaid: paid } : e)));
    try {
      const res = await fetch(`/api/leagues/${leagueId}/entries/${entryId}/dues`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paid }),
      });
      if (!res.ok) {
        setRows(prev);
        setError("Couldn't update — try again.");
      }
    } catch {
      setRows(prev);
      setError("Couldn't reach the server.");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 font-semibold">Dues</h2>
      <p className="mb-3 text-sm text-gray-500">
        {fee} per team{venmoHandle && (
          <>
            {" "}·{" "}
            <a
              href={`https://venmo.com/u/${venmoHandle}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              pay @{venmoHandle} on Venmo
            </a>
          </>
        )}{" "}
        · handled outside the app
      </p>
      <ul className="rounded-lg border text-sm">
        {rows.map((e) => (
          <li key={e.entryId} className="flex items-center justify-between border-b p-2 last:border-b-0">
            <span className={e.isMine ? "font-medium" : ""}>
              {e.name} <span className="text-gray-500">{e.ownerName}</span>
            </span>
            {isCommissioner ? (
              <button
                type="button"
                onClick={() => void toggle(e.entryId, !e.duesPaid)}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  e.duesPaid ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                }`}
              >
                {e.duesPaid ? "Paid ✓" : "Mark paid"}
              </button>
            ) : (
              <span
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  e.duesPaid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {e.duesPaid ? "Paid" : "Unpaid"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
