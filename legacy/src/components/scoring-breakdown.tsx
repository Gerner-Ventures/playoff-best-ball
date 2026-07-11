"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface StatLine {
  label: string;
  value: string;
  points: number;
  rawValue: number;
  multiplier: number;
  operation: "multiply" | "divide";
  explanation: string;
}

interface ScoringBreakdownProps {
  playerName: string;
  week: number;
  weekLabel: string;
  stats: {
    passYards?: number;
    passTd?: number;
    passInt?: number;
    rushYards?: number;
    rushTd?: number;
    recYards?: number;
    recTd?: number;
    receptions?: number;
    fgPoints?: number;
    xpMade?: number;
    xpMissed?: number;
    twoPtConv?: number;
    fumblesLost?: number;
    sacks?: number;
    interceptions?: number;
    fumblesRecovered?: number;
    defensiveTd?: number;
    safeties?: number;
    pointsAllowed?: number;
  };
  totalPoints: number;
}

const RULES = {
  passYardsPerPoint: 30,
  passTd: 6,
  passInt: -2,
  rushYardsPerPoint: 10,
  rushTd: 6,
  recYardsPerPoint: 10,
  recTd: 6,
  ppr: 0.5,
  twoPtConv: 2,
  fumbleLost: -2,
  returnTd: 6,
  xpMade: 1,
  xpMiss: -1,
  sack: 1,
  defInt: 2,
  fumRec: 2,
  dstTd: 6,
  safety: 4,
  block: 2,
};

function formatPoints(pts: number): string {
  if (pts === 0) return "0";
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)}`;
}

// Expandable stat row for mobile-friendly interaction
function StatRow({
  line,
  isExpanded,
  onToggle,
}: {
  line: StatLine;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-dashed border-[rgba(255,255,255,0.1)] last:border-0">
      {/* Main row - always visible */}
      <button
        onClick={onToggle}
        className="w-full py-2 flex items-center justify-between hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left"
      >
        <span className="flex items-center gap-1.5 text-[var(--chalk-white)]">
          {line.label}
          <svg
            className={`w-3.5 h-3.5 text-[var(--chalk-blue)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[var(--chalk-muted)] text-sm">{line.value}</span>
          <span
            className={`font-semibold min-w-[50px] text-right ${
              line.points > 0
                ? "text-[var(--chalk-green)]"
                : line.points < 0
                  ? "text-red-400"
                  : "text-[var(--chalk-muted)]"
            }`}
          >
            {formatPoints(line.points)}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="pb-3 px-2 animate-in slide-in-from-top-2 duration-200">
          <div className="bg-[rgba(0,0,0,0.3)] rounded-lg p-3 space-y-3">
            {/* Calculation */}
            <div className="flex items-center justify-center gap-2 font-mono text-sm">
              {line.operation === "divide" ? (
                <>
                  <span className="text-[var(--chalk-white)]">{line.rawValue}</span>
                  <span className="text-[var(--chalk-muted)]">÷</span>
                  <span className="text-[var(--chalk-white)]">{line.multiplier}</span>
                  <span className="text-[var(--chalk-muted)]">=</span>
                  <span className="text-[var(--chalk-green)] font-bold">
                    {line.points.toFixed(1)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[var(--chalk-white)]">{line.rawValue}</span>
                  <span className="text-[var(--chalk-muted)]">×</span>
                  <span className="text-[var(--chalk-white)]">{line.multiplier}</span>
                  <span className="text-[var(--chalk-muted)]">=</span>
                  <span
                    className={`font-bold ${line.points >= 0 ? "text-[var(--chalk-green)]" : "text-red-400"}`}
                  >
                    {line.points.toFixed(1)}
                  </span>
                </>
              )}
            </div>

            {/* Explanation */}
            <p className="text-xs text-[var(--chalk-muted)] leading-relaxed">{line.explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoringBreakdown({ weekLabel, stats, totalPoints }: ScoringBreakdownProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const statLines: StatLine[] = [];

  // Passing
  if (stats.passYards && stats.passYards > 0) {
    const pts = stats.passYards / RULES.passYardsPerPoint;
    statLines.push({
      label: "Passing Yards",
      value: `${stats.passYards} yds`,
      points: pts,
      rawValue: stats.passYards,
      multiplier: RULES.passYardsPerPoint,
      operation: "divide",
      explanation: `Every ${RULES.passYardsPerPoint} passing yards = 1 point`,
    });
  }
  if (stats.passTd && stats.passTd > 0) {
    const pts = stats.passTd * RULES.passTd;
    statLines.push({
      label: "Passing TDs",
      value: stats.passTd === 1 ? "1 TD" : `${stats.passTd} TDs`,
      points: pts,
      rawValue: stats.passTd,
      multiplier: RULES.passTd,
      operation: "multiply",
      explanation: `Each passing touchdown = ${RULES.passTd} points`,
    });
  }
  if (stats.passInt && stats.passInt > 0) {
    const pts = stats.passInt * RULES.passInt;
    statLines.push({
      label: "Interceptions",
      value: stats.passInt === 1 ? "1 INT" : `${stats.passInt} INTs`,
      points: pts,
      rawValue: stats.passInt,
      multiplier: RULES.passInt,
      operation: "multiply",
      explanation: `Each interception thrown = ${RULES.passInt} points`,
    });
  }

  // Rushing
  if (stats.rushYards && stats.rushYards > 0) {
    const pts = stats.rushYards / RULES.rushYardsPerPoint;
    statLines.push({
      label: "Rushing Yards",
      value: `${stats.rushYards} yds`,
      points: pts,
      rawValue: stats.rushYards,
      multiplier: RULES.rushYardsPerPoint,
      operation: "divide",
      explanation: `Every ${RULES.rushYardsPerPoint} rushing yards = 1 point`,
    });
  }
  if (stats.rushTd && stats.rushTd > 0) {
    const pts = stats.rushTd * RULES.rushTd;
    statLines.push({
      label: "Rushing TDs",
      value: stats.rushTd === 1 ? "1 TD" : `${stats.rushTd} TDs`,
      points: pts,
      rawValue: stats.rushTd,
      multiplier: RULES.rushTd,
      operation: "multiply",
      explanation: `Each rushing touchdown = ${RULES.rushTd} points`,
    });
  }

  // Receiving
  if (stats.receptions && stats.receptions > 0) {
    const pts = stats.receptions * RULES.ppr;
    statLines.push({
      label: "Receptions",
      value: stats.receptions === 1 ? "1 rec" : `${stats.receptions} rec`,
      points: pts,
      rawValue: stats.receptions,
      multiplier: RULES.ppr,
      operation: "multiply",
      explanation: `Half-PPR: Each catch = ${RULES.ppr} points`,
    });
  }
  if (stats.recYards && stats.recYards > 0) {
    const pts = stats.recYards / RULES.recYardsPerPoint;
    statLines.push({
      label: "Receiving Yards",
      value: `${stats.recYards} yds`,
      points: pts,
      rawValue: stats.recYards,
      multiplier: RULES.recYardsPerPoint,
      operation: "divide",
      explanation: `Every ${RULES.recYardsPerPoint} receiving yards = 1 point`,
    });
  }
  if (stats.recTd && stats.recTd > 0) {
    const pts = stats.recTd * RULES.recTd;
    statLines.push({
      label: "Receiving TDs",
      value: stats.recTd === 1 ? "1 TD" : `${stats.recTd} TDs`,
      points: pts,
      rawValue: stats.recTd,
      multiplier: RULES.recTd,
      operation: "multiply",
      explanation: `Each receiving touchdown = ${RULES.recTd} points`,
    });
  }

  // Kicking
  if (stats.fgPoints && stats.fgPoints !== 0) {
    statLines.push({
      label: "Field Goals",
      value: "varies",
      points: stats.fgPoints,
      rawValue: stats.fgPoints,
      multiplier: 1,
      operation: "multiply",
      explanation: `FG scoring by distance: 0-39 yds = 3 pts, 40-49 yds = 4 pts, 50+ yds = 5 pts`,
    });
  }
  if (stats.xpMade && stats.xpMade > 0) {
    const pts = stats.xpMade * RULES.xpMade;
    statLines.push({
      label: "Extra Points",
      value: stats.xpMade === 1 ? "1 XP" : `${stats.xpMade} XPs`,
      points: pts,
      rawValue: stats.xpMade,
      multiplier: RULES.xpMade,
      operation: "multiply",
      explanation: `Each extra point made = ${RULES.xpMade} point`,
    });
  }
  if (stats.xpMissed && stats.xpMissed > 0) {
    const pts = stats.xpMissed * RULES.xpMiss;
    statLines.push({
      label: "XP Missed",
      value: stats.xpMissed === 1 ? "1 miss" : `${stats.xpMissed} misses`,
      points: pts,
      rawValue: stats.xpMissed,
      multiplier: RULES.xpMiss,
      operation: "multiply",
      explanation: `Each extra point missed = ${RULES.xpMiss} point`,
    });
  }

  // Misc
  if (stats.twoPtConv && stats.twoPtConv > 0) {
    const pts = stats.twoPtConv * RULES.twoPtConv;
    statLines.push({
      label: "2-PT Conversions",
      value: stats.twoPtConv === 1 ? "1 conv" : `${stats.twoPtConv} conv`,
      points: pts,
      rawValue: stats.twoPtConv,
      multiplier: RULES.twoPtConv,
      operation: "multiply",
      explanation: `Each 2-point conversion = ${RULES.twoPtConv} points`,
    });
  }
  if (stats.fumblesLost && stats.fumblesLost > 0) {
    const pts = stats.fumblesLost * RULES.fumbleLost;
    statLines.push({
      label: "Fumbles Lost",
      value: stats.fumblesLost === 1 ? "1 fumble" : `${stats.fumblesLost} fumbles`,
      points: pts,
      rawValue: stats.fumblesLost,
      multiplier: RULES.fumbleLost,
      operation: "multiply",
      explanation: `Each fumble lost = ${RULES.fumbleLost} points`,
    });
  }

  // Defense
  if (stats.sacks && stats.sacks > 0) {
    const pts = stats.sacks * RULES.sack;
    statLines.push({
      label: "Sacks",
      value: stats.sacks === 1 ? "1 sack" : `${stats.sacks} sacks`,
      points: pts,
      rawValue: stats.sacks,
      multiplier: RULES.sack,
      operation: "multiply",
      explanation: `Each sack = ${RULES.sack} point`,
    });
  }
  if (stats.interceptions && stats.interceptions > 0) {
    const pts = stats.interceptions * RULES.defInt;
    statLines.push({
      label: "Interceptions",
      value: stats.interceptions === 1 ? "1 INT" : `${stats.interceptions} INTs`,
      points: pts,
      rawValue: stats.interceptions,
      multiplier: RULES.defInt,
      operation: "multiply",
      explanation: `Each interception = ${RULES.defInt} points`,
    });
  }
  if (stats.fumblesRecovered && stats.fumblesRecovered > 0) {
    const pts = stats.fumblesRecovered * RULES.fumRec;
    statLines.push({
      label: "Fumbles Recovered",
      value: stats.fumblesRecovered === 1 ? "1 rec" : `${stats.fumblesRecovered} rec`,
      points: pts,
      rawValue: stats.fumblesRecovered,
      multiplier: RULES.fumRec,
      operation: "multiply",
      explanation: `Each fumble recovered = ${RULES.fumRec} points`,
    });
  }
  if (stats.defensiveTd && stats.defensiveTd > 0) {
    const pts = stats.defensiveTd * RULES.dstTd;
    statLines.push({
      label: "Defensive TDs",
      value: stats.defensiveTd === 1 ? "1 TD" : `${stats.defensiveTd} TDs`,
      points: pts,
      rawValue: stats.defensiveTd,
      multiplier: RULES.dstTd,
      operation: "multiply",
      explanation: `Each defensive/ST touchdown = ${RULES.dstTd} points`,
    });
  }
  if (stats.safeties && stats.safeties > 0) {
    const pts = stats.safeties * RULES.safety;
    statLines.push({
      label: "Safeties",
      value: stats.safeties === 1 ? "1 safety" : `${stats.safeties} safeties`,
      points: pts,
      rawValue: stats.safeties,
      multiplier: RULES.safety,
      operation: "multiply",
      explanation: `Each safety = ${RULES.safety} points`,
    });
  }
  if (stats.pointsAllowed !== undefined) {
    let pts = 0;
    let explanation = "";
    if (stats.pointsAllowed === 0) {
      pts = 10;
      explanation = "Shutout = 10 points";
    } else if (stats.pointsAllowed <= 6) {
      pts = 7;
      explanation = "1-6 points allowed = 7 points";
    } else if (stats.pointsAllowed <= 13) {
      pts = 4;
      explanation = "7-13 points allowed = 4 points";
    } else if (stats.pointsAllowed <= 20) {
      pts = 1;
      explanation = "14-20 points allowed = 1 point";
    } else if (stats.pointsAllowed <= 27) {
      pts = 0;
      explanation = "21-27 points allowed = 0 points";
    } else if (stats.pointsAllowed <= 34) {
      pts = -1;
      explanation = "28-34 points allowed = -1 point";
    } else {
      pts = -3;
      explanation = "35+ points allowed = -3 points";
    }

    statLines.push({
      label: "Points Allowed",
      value: `${stats.pointsAllowed} pts`,
      points: pts,
      rawValue: stats.pointsAllowed,
      multiplier: pts,
      operation: "multiply",
      explanation: explanation,
    });
  }

  if (statLines.length === 0) {
    return (
      <Card className="bg-[rgba(0,0,0,0.2)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex justify-between">
            <span className="text-[var(--chalk-white)]">{weekLabel}</span>
            <span className="text-[var(--chalk-muted)]">-</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--chalk-muted)]">No stats recorded</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex justify-between items-center">
          <span className="text-[var(--chalk-white)]">{weekLabel}</span>
          <span className="text-[var(--chalk-green)] font-bold chalk-score">
            {totalPoints.toFixed(1)} pts
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Hint for mobile */}
        <p className="text-[10px] text-[var(--chalk-muted)] mb-2">
          Tap any stat for scoring details
        </p>

        <div className="text-sm">
          {statLines.map((line, i) => (
            <StatRow
              key={i}
              line={line}
              isExpanded={expandedIndex === i}
              onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
            />
          ))}

          {/* Total */}
          <div className="flex justify-between items-center pt-2 border-t-2 border-dashed border-[rgba(255,255,255,0.3)] mt-1">
            <span className="font-semibold text-[var(--chalk-white)]">Total</span>
            <span className="font-bold text-[var(--chalk-green)] chalk-score">
              {totalPoints.toFixed(1)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
