"use client";

import { EnhancedProjectionBreakdown } from "@/types";

/**
 * ProjectionSourceBar - Visual representation of source contribution
 * Shows the split between prop-based and historical projections
 */
interface ProjectionSourceBarProps {
  propWeight: number;
  historicalWeight: number;
  propPoints: number | null;
  historicalPoints: number | null;
  compact?: boolean;
}

export function ProjectionSourceBar({
  propWeight,
  historicalWeight,
  propPoints,
  historicalPoints,
  compact = false,
}: ProjectionSourceBarProps) {
  const propPct = Math.round(propWeight * 100);
  const histPct = Math.round(historicalWeight * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden flex">
          {propPct > 0 && (
            <div
              className="h-full bg-[var(--chalk-blue)]"
              style={{ width: `${propPct}%` }}
              title={`Props: ${propPct}%`}
            />
          )}
          {histPct > 0 && (
            <div
              className="h-full bg-[var(--chalk-green)]"
              style={{ width: `${histPct}%` }}
              title={`Historical: ${histPct}%`}
            />
          )}
        </div>
        <span className="text-[10px] text-[var(--chalk-muted)] whitespace-nowrap">
          {propPct > 0 && histPct > 0 ? `${propPct}/${histPct}` : propPct > 0 ? "Props" : "Hist"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--chalk-muted)]">Source Blend</span>
        <span className="text-[var(--chalk-white)]">
          {propPct}% props / {histPct}% historical
        </span>
      </div>
      <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden flex">
        {propPct > 0 && (
          <div
            className="h-full bg-[var(--chalk-blue)] transition-all"
            style={{ width: `${propPct}%` }}
          />
        )}
        {histPct > 0 && (
          <div
            className="h-full bg-[var(--chalk-green)] transition-all"
            style={{ width: `${histPct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-[var(--chalk-muted)]">
        <span>Props: {propPoints?.toFixed(1) ?? "N/A"} pts</span>
        <span>Historical: {historicalPoints?.toFixed(1) ?? "N/A"} pts</span>
      </div>
    </div>
  );
}

/**
 * ConfidenceGauge - Visual confidence indicator
 */
interface ConfidenceGaugeProps {
  level: "high" | "medium" | "low";
  score?: number;
  factors?: string[];
  compact?: boolean;
}

export function ConfidenceGauge({ level, score, factors, compact = false }: ConfidenceGaugeProps) {
  const colorMap = {
    high: { bg: "bg-green-500", text: "text-green-400", label: "High" },
    medium: { bg: "bg-yellow-500", text: "text-yellow-400", label: "Med" },
    low: { bg: "bg-red-500", text: "text-red-400", label: "Low" },
  };

  const { bg, text, label } = colorMap[level];

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${text} bg-opacity-20 ${bg.replace("bg-", "bg-")}/20`}
        title={factors?.join(", ")}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${bg}`} />
        {label}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--chalk-muted)]">Confidence</span>
        <span className={`text-xs font-medium ${text}`}>
          {label} {score !== undefined && `(${score}/100)`}
        </span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${bg}`}
          style={{ width: `${score ?? (level === "high" ? 80 : level === "medium" ? 50 : 25)}%` }}
        />
      </div>
      {factors && factors.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {factors.map((factor, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 bg-gray-800 rounded text-[var(--chalk-muted)]"
            >
              {factor}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ProjectionRange - Shows low/median/high range
 */
interface ProjectionRangeProps {
  low: number;
  median: number;
  high: number;
  compact?: boolean;
}

export function ProjectionRange({ low, median, high, compact = false }: ProjectionRangeProps) {
  // Position the median marker relative to the range
  const range = high - low;
  const medianPosition = range > 0 ? ((median - low) / range) * 100 : 50;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-[var(--chalk-muted)]">{low.toFixed(1)}</span>
        <div className="flex-1 h-1 bg-gray-700 rounded-full relative min-w-[30px]">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--chalk-yellow)] rounded-full"
            style={{ left: `calc(${medianPosition}% - 4px)` }}
          />
        </div>
        <span className="text-[var(--chalk-muted)]">{high.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--chalk-muted)]">Projection Range</span>
        <span className="text-[var(--chalk-yellow)]">{median.toFixed(1)} pts</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full relative overflow-hidden">
        {/* Gradient background showing range */}
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 via-yellow-500/30 to-green-500/30" />
        {/* Median marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--chalk-yellow)]"
          style={{ left: `${medianPosition}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--chalk-yellow)] rounded-full border-2 border-gray-900"
          style={{ left: `calc(${medianPosition}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--chalk-muted)]">
        <span>Low: {low.toFixed(1)}</span>
        <span>High: {high.toFixed(1)}</span>
      </div>
    </div>
  );
}

/**
 * WeatherAdjustmentBadge - Shows weather impact on projection
 */
interface WeatherAdjustmentBadgeProps {
  applied: boolean;
  impact: "high" | "medium" | "low" | "none";
  multiplier: number;
  conditions?: string;
  compact?: boolean;
}

export function WeatherAdjustmentBadge({
  applied,
  impact,
  multiplier,
  conditions,
  compact = false,
}: WeatherAdjustmentBadgeProps) {
  if (!applied || impact === "none") {
    if (compact) return null;
    return <span className="text-[10px] text-[var(--chalk-muted)]">No weather impact</span>;
  }

  const impactColors = {
    high: "text-red-400",
    medium: "text-yellow-400",
    low: "text-blue-400",
    none: "text-[var(--chalk-muted)]",
  };

  const adjustmentPct = Math.round((1 - multiplier) * 100);
  const sign = multiplier < 1 ? "-" : "+";

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] ${impactColors[impact]}`}
        title={conditions}
      >
        {impact === "high" ? "🌧️" : impact === "medium" ? "💨" : "🌤️"}
        {sign}
        {Math.abs(adjustmentPct)}%
      </span>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--chalk-muted)]">Weather Adjustment</span>
      <span className={impactColors[impact]}>
        {impact === "high" ? "🌧️" : impact === "medium" ? "💨" : "🌤️"} {sign}
        {Math.abs(adjustmentPct)}% ({conditions})
      </span>
    </div>
  );
}

/**
 * PropsBreakdownTable - Shows individual prop lines and their point contributions
 */
interface PropsBreakdownTableProps {
  props: EnhancedProjectionBreakdown["props"];
}

export function PropsBreakdownTable({ props }: PropsBreakdownTableProps) {
  if (!props) return null;

  const rows: { label: string; line: string; points: number }[] = [];

  if (props.passYards) {
    rows.push({
      label: "Pass Yds",
      line: `${props.passYards.line}`,
      points: props.passYards.points,
    });
  }
  if (props.rushYards) {
    rows.push({
      label: "Rush Yds",
      line: `${props.rushYards.line}`,
      points: props.rushYards.points,
    });
  }
  if (props.recYards) {
    rows.push({ label: "Rec Yds", line: `${props.recYards.line}`, points: props.recYards.points });
  }
  if (props.receptions) {
    rows.push({
      label: "Receptions",
      line: `${props.receptions.line}`,
      points: props.receptions.points,
    });
  }
  if (props.anytimeTd) {
    rows.push({
      label: "Anytime TD",
      line: `${Math.round(props.anytimeTd.probability * 100)}%`,
      points: props.anytimeTd.points,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--chalk-muted)]">Prop Lines</div>
      <div className="bg-gray-800/50 rounded p-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--chalk-muted)] text-[10px]">
              <th className="text-left font-normal">Stat</th>
              <th className="text-right font-normal">Line</th>
              <th className="text-right font-normal">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="text-[var(--chalk-white)]">{row.label}</td>
                <td className="text-right text-[var(--chalk-muted)]">{row.line}</td>
                <td className="text-right text-[var(--chalk-green)]">+{row.points.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * ProjectionBreakdownCard - Full breakdown card for a player's projection
 */
interface ProjectionBreakdownCardProps {
  playerName: string;
  position: string;
  team: string | null;
  breakdown: EnhancedProjectionBreakdown;
  onClose?: () => void;
}

export function ProjectionBreakdownCard({
  playerName,
  position,
  team,
  breakdown,
  onClose,
}: ProjectionBreakdownCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-[var(--chalk-white)]">{playerName}</h3>
          <p className="text-sm text-[var(--chalk-muted)]">
            {position} - {team || "FA"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[var(--chalk-yellow)]">
            {breakdown.projectedPoints.toFixed(1)}
          </div>
          <div className="text-xs text-[var(--chalk-muted)]">projected pts</div>
          {breakdown.expectedValue !== null && (
            <div className="text-sm text-[var(--chalk-green)] mt-1">
              EV: {breakdown.expectedValue.toFixed(1)}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--chalk-muted)] hover:text-[var(--chalk-white)] ml-2"
          >
            &times;
          </button>
        )}
      </div>

      {/* Confidence */}
      <ConfidenceGauge
        level={breakdown.confidence.level}
        score={breakdown.confidence.score}
        factors={breakdown.confidence.factors}
      />

      {/* Source Blend */}
      <ProjectionSourceBar
        propWeight={breakdown.sources.propWeight}
        historicalWeight={breakdown.sources.historicalWeight}
        propPoints={breakdown.sources.propBased}
        historicalPoints={breakdown.sources.historicalAvg}
      />

      {/* Projection Range */}
      <ProjectionRange
        low={breakdown.range.low}
        median={breakdown.range.median}
        high={breakdown.range.high}
      />

      {/* Weather Adjustment */}
      <WeatherAdjustmentBadge
        applied={breakdown.adjustments.weather.applied}
        impact={breakdown.adjustments.weather.impact}
        multiplier={breakdown.adjustments.weather.multiplier}
        conditions={breakdown.adjustments.weather.conditions}
      />

      {/* Props Breakdown */}
      <PropsBreakdownTable props={breakdown.props} />

      {/* Data Freshness */}
      <div className="pt-2 border-t border-gray-700 text-[10px] text-[var(--chalk-muted)] flex justify-between">
        <span>
          {breakdown.dataFreshness.historicalGamesCount} playoff game
          {breakdown.dataFreshness.historicalGamesCount !== 1 ? "s" : ""}
        </span>
        {breakdown.dataFreshness.propsUpdatedAt && (
          <span>
            Props updated: {new Date(breakdown.dataFreshness.propsUpdatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * CompactProjectionBadge - Small inline badge showing key projection info
 */
interface CompactProjectionBadgeProps {
  source: "prop" | "historical" | "blended";
  confidence: "high" | "medium" | "low";
  propCount?: number;
}

export function CompactProjectionBadge({
  source,
  confidence,
  propCount,
}: CompactProjectionBadgeProps) {
  const sourceLabels = {
    prop: "Props",
    historical: "Hist",
    blended: "Blend",
  };

  const sourceColors = {
    prop: "text-[var(--chalk-blue)]",
    historical: "text-[var(--chalk-green)]",
    blended: "text-[var(--chalk-purple)]",
  };

  return (
    <div className="flex items-center gap-1">
      <span className={`text-[10px] ${sourceColors[source]}`}>
        {sourceLabels[source]}
        {propCount !== undefined && propCount > 0 && ` (${propCount})`}
      </span>
      <ConfidenceGauge level={confidence} compact />
    </div>
  );
}
