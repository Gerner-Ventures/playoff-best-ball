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
      <p className="mb-3 text-sm text-chalk-dim">
        {fee} per team{venmoHandle && (
          <>
            {" "}·{" "}
            <a
              href={`https://venmo.com/u/${venmoHandle.replace(/^@/, "")}`}
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
      <ul className="text-sm chalk-card">
        {rows.map((e) => (
          <li key={e.entryId} className="flex items-center justify-between border-b p-2 last:border-b-0 border-chalk-line">
            <span className={e.isMine ? "font-medium" : ""}>
              {e.name} <span className="text-chalk-dim">{e.ownerName}</span>
            </span>
            {isCommissioner ? (
              <button
                type="button"
                onClick={() => void toggle(e.entryId, !e.duesPaid)}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  e.duesPaid ? "border-2 border-chalk-mint text-chalk-mint" : "border-2 border-chalk-line text-chalk-dim"
                }`}
              >
                {e.duesPaid ? "Paid ✓" : "Mark paid"}
              </button>
            ) : (
              <span
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  e.duesPaid ? "border-2 border-chalk-mint text-chalk-mint" : "border-2 border-chalk-yellow text-chalk-yellow"
                }`}
              >
                {e.duesPaid ? "Paid" : "Unpaid"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-chalk-coral">{error}</p>}
    </section>
  );
}
