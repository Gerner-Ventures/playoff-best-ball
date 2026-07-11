"use client";

import { PropType } from "@prisma/client";

interface PropProgressBarProps {
  propType: PropType | string;
  line: number;
  current: number;
  gameProgress?: number; // 0-1 for game completion (quarters elapsed / 4)
  compact?: boolean;
}

// Human-readable labels for prop types
const PROP_LABELS: Record<string, string> = {
  PASS_YARDS: "pass yds",
  PASS_TDS: "pass TDs",
  RUSH_YARDS: "rush yds",
  REC_YARDS: "rec yds",
  RECEPTIONS: "rec",
  ANYTIME_TD: "TD",
};

// Short labels for compact mode
const PROP_LABELS_SHORT: Record<string, string> = {
  PASS_YARDS: "Pass",
  PASS_TDS: "PTD",
  RUSH_YARDS: "Rush",
  REC_YARDS: "Rec",
  RECEPTIONS: "Rec",
  ANYTIME_TD: "TD",
};

/**
 * PropProgressBar - Shows progress toward hitting a prop bet line
 *
 * Colors:
 * - Green: Already hit the over
 * - Blue: On pace to hit
 * - Yellow: Below pace but still possible
 * - Red: Likely to miss
 */
export function PropProgressBar({
  propType,
  line,
  current,
  gameProgress = 0.5,
  compact = false,
}: PropProgressBarProps) {
  const percentage = Math.min((current / line) * 100, 100);
  const onPace = current >= line * gameProgress;
  const hitOver = current >= line;
  const remaining = Math.max(line - current, 0);

  // Determine color based on status
  let barColor = "bg-yellow-500";
  let textColor = "text-yellow-400";

  if (hitOver) {
    barColor = "bg-green-500";
    textColor = "text-green-400";
  } else if (onPace) {
    barColor = "bg-blue-500";
    textColor = "text-blue-400";
  } else if (gameProgress > 0.75 && percentage < 60) {
    barColor = "bg-red-500";
    textColor = "text-red-400";
  }

  const label = compact
    ? PROP_LABELS_SHORT[propType] || propType
    : PROP_LABELS[propType] || propType;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-[var(--chalk-muted)] w-8">{label}</span>
        <div className="flex-1 h-1 bg-gray-700 rounded-full min-w-[40px]">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className={`${textColor} font-mono w-12 text-right`}>
          {current}/{line}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--chalk-muted)]">{label}</span>
        <span className={textColor}>
          {current.toFixed(0)}/{line} {hitOver ? "OVER" : `(${remaining.toFixed(0)} to go)`}
        </span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {gameProgress > 0 && !hitOver && (
        <div className="flex items-center justify-between text-[10px] text-[var(--chalk-muted)]">
          <span>
            {onPace ? "On pace" : "Below pace"} ({Math.round(gameProgress * 100)}% of game)
          </span>
          <span>Need {(remaining / (1 - gameProgress)).toFixed(0)} remaining to hit</span>
        </div>
      )}
    </div>
  );
}

/**
 * PropSummary - Shows all props for a player in a compact format
 */
interface PropSummaryProps {
  props: { propType: PropType | string; line: number }[];
  currentStats?: {
    passYards?: number;
    rushYards?: number;
    recYards?: number;
    receptions?: number;
    passTd?: number;
    rushTd?: number;
    recTd?: number;
  };
  gameProgress?: number;
}

export function PropSummary({ props, currentStats, gameProgress = 0.5 }: PropSummaryProps) {
  if (props.length === 0) return null;

  // Map current stats to prop types
  const getCurrentForProp = (propType: string): number => {
    if (!currentStats) return 0;
    switch (propType) {
      case "PASS_YARDS":
        return currentStats.passYards || 0;
      case "RUSH_YARDS":
        return currentStats.rushYards || 0;
      case "REC_YARDS":
        return currentStats.recYards || 0;
      case "RECEPTIONS":
        return currentStats.receptions || 0;
      case "PASS_TDS":
        return currentStats.passTd || 0;
      case "ANYTIME_TD":
        return (currentStats.rushTd || 0) + (currentStats.recTd || 0);
      default:
        return 0;
    }
  };

  return (
    <div className="space-y-1 mt-2 pt-2 border-t border-[rgba(255,255,255,0.1)]">
      <div className="text-[10px] text-[var(--chalk-muted)] uppercase tracking-wide mb-1">
        Prop Lines
      </div>
      <div className="space-y-1">
        {props.map((prop, idx) => (
          <PropProgressBar
            key={`${prop.propType}-${idx}`}
            propType={prop.propType}
            line={prop.line}
            current={getCurrentForProp(prop.propType as string)}
            gameProgress={gameProgress}
            compact
          />
        ))}
      </div>
    </div>
  );
}

/**
 * WeatherIndicator - Shows weather conditions for a game
 */
interface WeatherIndicatorProps {
  temperature?: number;
  windSpeed?: number;
  condition?: string;
  isDome?: boolean;
  compact?: boolean;
}

export function WeatherIndicator({
  temperature,
  windSpeed,
  condition,
  isDome,
  compact = true,
}: WeatherIndicatorProps) {
  if (isDome) {
    if (compact) {
      return (
        <span className="text-xs text-[var(--chalk-muted)]" title="Dome stadium">
          🏟️
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-[var(--chalk-muted)]">
        <span>🏟️</span>
        <span>Dome</span>
      </div>
    );
  }

  // Get weather icon based on condition
  const getIcon = () => {
    if (!condition) return "🌤️";
    const c = condition.toLowerCase();
    if (c.includes("clear") || c.includes("sun")) return "☀️";
    if (c.includes("cloud")) return "☁️";
    if (c.includes("rain") || c.includes("drizzle")) return "🌧️";
    if (c.includes("snow")) return "❄️";
    if (c.includes("thunder")) return "⛈️";
    if (c.includes("fog")) return "🌫️";
    return "🌤️";
  };

  // Determine if weather is concerning for fantasy
  const isConcerning = (windSpeed && windSpeed >= 15) || (temperature && temperature <= 32);

  if (compact) {
    return (
      <span
        className={`text-xs ${isConcerning ? "text-yellow-400" : "text-[var(--chalk-muted)]"}`}
        title={`${temperature ?? "?"}°F, ${windSpeed ?? "?"}mph wind, ${condition ?? "Unknown"}`}
      >
        {getIcon()} {temperature ? `${temperature}°` : ""}
        {windSpeed && windSpeed >= 15 ? ` 💨${windSpeed}` : ""}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 text-xs ${isConcerning ? "text-yellow-400" : "text-[var(--chalk-muted)]"}`}
    >
      <span>{getIcon()}</span>
      <span>{temperature ? `${temperature}°F` : "--"}</span>
      {windSpeed !== undefined && (
        <span className={windSpeed >= 15 ? "text-yellow-400" : ""}>💨 {windSpeed}mph</span>
      )}
      <span>{condition || "Unknown"}</span>
    </div>
  );
}
