"use client";

import Link from "next/link";

interface SubstitutionData {
  effectiveWeek: number;
  reason?: string | null;
  substitutePlayer: {
    id: string;
    name: string;
    team?: string | null;
  };
}

interface PlayerRowProps {
  slot: string;
  name: string;
  points: number;
  playerId?: string;
  compact?: boolean;
  isEliminated?: boolean;
  teamUnknown?: boolean;
  // Substitution props
  hasSubstitution?: boolean;
  substitution?: SubstitutionData | null;
}

const slotClasses: Record<string, string> = {
  QB: "chalk-badge-qb",
  RB1: "chalk-badge-rb",
  RB2: "chalk-badge-rb",
  WR1: "chalk-badge-wr",
  WR2: "chalk-badge-wr",
  TE: "chalk-badge-te",
  FLEX: "chalk-badge-flex",
  K: "chalk-badge-k",
  DST: "chalk-badge-dst",
};

const WEEK_LABELS: Record<number, string> = {
  1: "WC",
  2: "DIV",
  3: "CC",
  5: "SB",
};

export function PlayerRow({
  slot,
  name,
  points,
  playerId,
  compact = false,
  isEliminated = false,
  teamUnknown = false,
  hasSubstitution = false,
  substitution = null,
}: PlayerRowProps) {
  const badgeClass = slotClasses[slot] ?? "chalk-badge-flex";
  const displaySlot = slot.replace(/[0-9]/g, "");

  // Player has a substitution (original player is injured)
  const isInjured = hasSubstitution;

  // Score styling - only fade if eliminated, NOT if just injured (substitute is still playing)
  const scoreClass = isEliminated
    ? "text-[var(--chalk-muted)]"
    : points > 0
      ? "text-[var(--chalk-green)]"
      : points < 0
        ? "text-[var(--chalk-red)]"
        : "text-[var(--chalk-muted)]";

  const content = (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`chalk-badge ${badgeClass} ${compact ? "text-xs px-1" : ""} ${isEliminated ? "opacity-50" : ""}`}
        >
          {displaySlot}
        </span>
        <span
          className={`font-medium ${compact ? "text-sm" : ""} ${isEliminated ? "text-[var(--chalk-muted)] line-through" : isInjured ? "text-[var(--chalk-muted)] line-through" : "text-[var(--chalk-white)]"}`}
        >
          {name}
        </span>
        {isInjured && (
          <span
            className="text-[8px] text-orange-400 bg-orange-900/30 px-1 py-0.5 rounded"
            title={substitution?.reason || "Injured - out for playoffs"}
          >
            INJ
          </span>
        )}
        {isEliminated && !isInjured && (
          <span className="text-[8px] text-red-400 bg-red-900/30 px-1 py-0.5 rounded">OUT</span>
        )}
        {teamUnknown && !isEliminated && !isInjured && (
          <span
            className="text-[8px] text-yellow-400 bg-yellow-900/30 px-1 py-0.5 rounded"
            title="Team status unknown"
          >
            ?
          </span>
        )}
        {/* Show substitute player */}
        {substitution && (
          <span className="flex items-center gap-1 text-xs">
            <span className="text-[var(--chalk-muted)]">/</span>
            {substitution.substitutePlayer.id ? (
              <Link
                href={`/player/${substitution.substitutePlayer.id}`}
                className="text-[var(--chalk-blue)] hover:text-[var(--chalk-pink)] hover:underline"
              >
                {substitution.substitutePlayer.name}
              </Link>
            ) : (
              <span className="text-[var(--chalk-white)]">
                {substitution.substitutePlayer.name}
              </span>
            )}
            <span
              className="text-[8px] text-blue-400 bg-blue-900/30 px-1 py-0.5 rounded"
              title={`Substitute from ${WEEK_LABELS[substitution.effectiveWeek] || `Week ${substitution.effectiveWeek}`}`}
            >
              SUB
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className={`font-bold chalk-score ${scoreClass} ${compact ? "text-sm" : ""}`}>
          {points.toFixed(1)}
        </span>
      </div>
    </>
  );

  // Only fade row when eliminated, not just for having a substitution
  const baseClasses = `flex items-center justify-between ${
    compact ? "py-1.5" : "py-2"
  } border-b border-dashed border-[rgba(255,255,255,0.1)] last:border-0 ${isEliminated ? "opacity-60" : ""}`;

  if (playerId) {
    return (
      <Link
        href={`/player/${playerId}`}
        className={`${baseClasses} hover:bg-[rgba(255,255,255,0.05)] rounded px-2 -mx-2 transition-colors cursor-pointer group`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`chalk-badge ${badgeClass} ${compact ? "text-xs px-1" : ""} ${isEliminated ? "opacity-50" : ""}`}
          >
            {displaySlot}
          </span>
          <span
            className={`font-medium group-hover:text-[var(--chalk-pink)] ${compact ? "text-sm" : ""} ${isEliminated ? "text-[var(--chalk-muted)] line-through" : isInjured ? "text-[var(--chalk-muted)] line-through" : "text-[var(--chalk-white)]"}`}
          >
            {name}
          </span>
          {isInjured && (
            <span
              className="text-[8px] text-orange-400 bg-orange-900/30 px-1 py-0.5 rounded"
              title={substitution?.reason || "Injured - out for playoffs"}
            >
              INJ
            </span>
          )}
          {isEliminated && !isInjured && (
            <span className="text-[8px] text-red-400 bg-red-900/30 px-1 py-0.5 rounded">OUT</span>
          )}
          {teamUnknown && !isEliminated && !isInjured && (
            <span
              className="text-[8px] text-yellow-400 bg-yellow-900/30 px-1 py-0.5 rounded"
              title="Team status unknown"
            >
              ?
            </span>
          )}
          {/* Show substitute player */}
          {substitution && (
            <span className="flex items-center gap-1 text-xs">
              <span className="text-[var(--chalk-muted)]">/</span>
              <span
                className="text-[var(--chalk-blue)] group-hover:text-[var(--chalk-pink)]"
                onClick={(e) => {
                  if (substitution.substitutePlayer.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = `/player/${substitution.substitutePlayer.id}`;
                  }
                }}
              >
                {substitution.substitutePlayer.name}
              </span>
              <span
                className="text-[8px] text-blue-400 bg-blue-900/30 px-1 py-0.5 rounded"
                title={`Substitute from ${WEEK_LABELS[substitution.effectiveWeek] || `Week ${substitution.effectiveWeek}`}`}
              >
                SUB
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold chalk-score ${scoreClass} ${compact ? "text-sm" : ""}`}>
            {points.toFixed(1)}
          </span>
          <span className="text-[var(--chalk-pink)] opacity-0 group-hover:opacity-100 transition-opacity text-sm">
            →
          </span>
        </div>
      </Link>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}
