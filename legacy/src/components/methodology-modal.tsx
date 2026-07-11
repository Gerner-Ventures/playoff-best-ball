"use client";

import { useState } from "react";

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MethodologyModal({ isOpen, onClose }: MethodologyModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "sources" | "calculations" | "glossary">(
    "overview"
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-[var(--chalk-yellow)]">Projection Methodology</h2>
          <button
            onClick={onClose}
            className="text-[var(--chalk-muted)] hover:text-[var(--chalk-white)] text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { id: "overview", label: "Overview" },
            { id: "sources", label: "Data Sources" },
            { id: "calculations", label: "Calculations" },
            { id: "glossary", label: "Glossary" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--chalk-surface)] text-[var(--chalk-yellow)] border-b-2 border-[var(--chalk-yellow)]"
                  : "text-[var(--chalk-muted)] hover:text-[var(--chalk-text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "overview" && <OverviewContent />}
          {activeTab === "sources" && <SourcesContent />}
          {activeTab === "calculations" && <CalculationsContent />}
          {activeTab === "glossary" && <GlossaryContent />}
        </div>
      </div>
    </div>
  );
}

function OverviewContent() {
  return (
    <div className="space-y-4 text-sm text-[var(--chalk-text)]">
      <p>
        Our projection system combines multiple data sources to estimate how many fantasy points
        each player is expected to score, adjusted for their team&apos;s probability of advancing in
        the playoffs.
      </p>

      <div className="bg-[var(--chalk-surface)] rounded-lg p-4">
        <h3 className="font-semibold text-[var(--chalk-yellow)] mb-2">How It Works</h3>
        <ol className="list-decimal list-inside space-y-2 text-[var(--chalk-muted)]">
          <li>
            <strong className="text-[var(--chalk-text)]">Gather betting props</strong> - Vegas lines
            for passing yards, rushing yards, receiving yards, and touchdowns
          </li>
          <li>
            <strong className="text-[var(--chalk-text)]">Calculate historical average</strong> -
            Recent playoff performance with recency weighting
          </li>
          <li>
            <strong className="text-[var(--chalk-text)]">Blend projections</strong> - Adaptive
            weighting based on data quality and confidence
          </li>
          <li>
            <strong className="text-[var(--chalk-text)]">Apply adjustments</strong> - Weather impact
            for outdoor games
          </li>
          <li>
            <strong className="text-[var(--chalk-text)]">Calculate Expected Value</strong> -
            Multiply projected points by team&apos;s win probability
          </li>
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
          <div className="text-[var(--chalk-blue)] font-semibold mb-1">Prop-Based</div>
          <p className="text-xs text-[var(--chalk-muted)]">
            Uses Vegas betting lines which reflect market consensus. Most accurate for well-covered
            players with multiple prop lines.
          </p>
        </div>
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
          <div className="text-[var(--chalk-green)] font-semibold mb-1">Historical</div>
          <p className="text-xs text-[var(--chalk-muted)]">
            Based on recent playoff performance. More recent games weighted higher. Reliable for
            players with consistent playoff history.
          </p>
        </div>
      </div>
    </div>
  );
}

function SourcesContent() {
  return (
    <div className="space-y-4 text-sm text-[var(--chalk-text)]">
      <h3 className="font-semibold text-[var(--chalk-yellow)]">Primary Data Sources</h3>

      <div className="space-y-3">
        <div className="bg-[var(--chalk-surface)] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📊</span>
            <span className="font-semibold">The Odds API</span>
          </div>
          <p className="text-xs text-[var(--chalk-muted)]">
            Aggregates betting lines from major sportsbooks (DraftKings, FanDuel, BetMGM). Provides
            player prop lines and team moneylines for win probabilities.
          </p>
        </div>

        <div className="bg-[var(--chalk-surface)] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🏈</span>
            <span className="font-semibold">ESPN API</span>
          </div>
          <p className="text-xs text-[var(--chalk-muted)]">
            Live game data, player statistics, team rosters, and playoff bracket information.
            Updates in real-time during games.
          </p>
        </div>

        <div className="bg-[var(--chalk-surface)] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🌤️</span>
            <span className="font-semibold">Open-Meteo</span>
          </div>
          <p className="text-xs text-[var(--chalk-muted)]">
            Free weather forecasts for outdoor stadium locations. Temperature, wind speed, and
            precipitation data used for weather adjustments.
          </p>
        </div>
      </div>

      <h3 className="font-semibold text-[var(--chalk-yellow)] mt-4">Prop Types Used</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800 rounded p-2">
          <span className="text-[var(--chalk-blue)]">Pass Yards</span> - QB projections
        </div>
        <div className="bg-gray-800 rounded p-2">
          <span className="text-[var(--chalk-blue)]">Rush Yards</span> - RB/QB projections
        </div>
        <div className="bg-gray-800 rounded p-2">
          <span className="text-[var(--chalk-blue)]">Rec Yards</span> - WR/TE projections
        </div>
        <div className="bg-gray-800 rounded p-2">
          <span className="text-[var(--chalk-blue)]">Receptions</span> - PPR value
        </div>
        <div className="bg-gray-800 rounded p-2">
          <span className="text-[var(--chalk-blue)]">Anytime TD</span> - TD probability
        </div>
        <div className="bg-gray-800 rounded p-2">
          <span className="text-[var(--chalk-blue)]">Pass TDs</span> - QB TD projections
        </div>
      </div>
    </div>
  );
}

function CalculationsContent() {
  return (
    <div className="space-y-4 text-sm text-[var(--chalk-text)]">
      <h3 className="font-semibold text-[var(--chalk-yellow)]">Fantasy Point Conversion</h3>
      <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs">
        <div className="text-[var(--chalk-muted)] mb-2">{"//"} Scoring Rules (Half-PPR)</div>
        <div>
          Pass Yards: <span className="text-[var(--chalk-green)]">1 pt per 25 yards</span>
        </div>
        <div>
          Rush/Rec Yards: <span className="text-[var(--chalk-green)]">1 pt per 10 yards</span>
        </div>
        <div>
          Receptions: <span className="text-[var(--chalk-green)]">0.5 pts each</span>
        </div>
        <div>
          Touchdowns: <span className="text-[var(--chalk-green)]">6 pts (4 for pass TD)</span>
        </div>
      </div>

      <h3 className="font-semibold text-[var(--chalk-yellow)]">Adaptive Blending</h3>
      <p className="text-xs text-[var(--chalk-muted)]">
        The system adjusts the weight given to prop-based vs historical projections based on:
      </p>
      <ul className="text-xs text-[var(--chalk-muted)] list-disc list-inside space-y-1">
        <li>
          <strong className="text-[var(--chalk-text)]">Prop count:</strong> More props = higher prop
          weight (+5% per prop above minimum)
        </li>
        <li>
          <strong className="text-[var(--chalk-text)]">Recency:</strong> Props updated within 24
          hours get +10% weight
        </li>
        <li>
          <strong className="text-[var(--chalk-text)]">Sample size:</strong> Fewer than 2 historical
          games = -15% historical weight
        </li>
      </ul>

      <h3 className="font-semibold text-[var(--chalk-yellow)]">Weather Adjustments</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--chalk-muted)] border-b border-gray-700">
              <th className="text-left py-2">Position</th>
              <th className="text-right py-2">High Impact</th>
              <th className="text-right py-2">Medium</th>
              <th className="text-right py-2">Low</th>
            </tr>
          </thead>
          <tbody className="text-[var(--chalk-text)]">
            <tr className="border-b border-gray-800">
              <td className="py-1">QB</td>
              <td className="text-right text-red-400">-15%</td>
              <td className="text-right text-yellow-400">-8%</td>
              <td className="text-right text-green-400">-3%</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-1">K</td>
              <td className="text-right text-red-400">-25%</td>
              <td className="text-right text-yellow-400">-12%</td>
              <td className="text-right text-green-400">-5%</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-1">WR/TE</td>
              <td className="text-right text-red-400">-10%</td>
              <td className="text-right text-yellow-400">-5%</td>
              <td className="text-right text-green-400">-2%</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="py-1">RB</td>
              <td className="text-right text-yellow-400">-2%</td>
              <td className="text-right text-green-400">-1%</td>
              <td className="text-right">0%</td>
            </tr>
            <tr>
              <td className="py-1">DST</td>
              <td className="text-right text-green-400">+5%</td>
              <td className="text-right text-green-400">+2%</td>
              <td className="text-right">0%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="font-semibold text-[var(--chalk-yellow)]">Expected Value (EV)</h3>
      <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs">
        <div className="text-[var(--chalk-green)]">EV = Projected Points × Win Probability</div>
        <div className="text-[var(--chalk-muted)] mt-2">Example:</div>
        <div className="text-[var(--chalk-text)]">
          Player projects 15.0 pts, team has 60% win prob
        </div>
        <div className="text-[var(--chalk-green)]">EV = 15.0 × 0.60 = 9.0</div>
      </div>

      <h3 className="font-semibold text-[var(--chalk-yellow)]">Rest of Playoffs EV</h3>
      <div className="bg-gray-800 rounded-lg p-3 font-mono text-xs">
        <div className="text-[var(--chalk-muted)]">{"//"} Cumulative advance probability</div>
        <div className="text-[var(--chalk-text)]">Week 1: 60% × 15pts = 9.0 EV</div>
        <div className="text-[var(--chalk-text)]">Week 2: (60% × 65%) × 15pts = 5.85 EV</div>
        <div className="text-[var(--chalk-text)]">Week 3: (60% × 65% × 55%) × 15pts = 3.22 EV</div>
        <div className="text-[var(--chalk-green)] mt-1">Total Remaining EV = 18.07</div>
      </div>
    </div>
  );
}

function GlossaryContent() {
  const terms = [
    {
      term: "EV (Expected Value)",
      definition:
        "The average points a player is expected to score, weighted by their team's probability of playing. A player on a team likely to lose has lower EV.",
    },
    {
      term: "Projected Points",
      definition:
        "The estimated fantasy points a player will score IF their team plays. This doesn't account for elimination risk.",
    },
    {
      term: "Win Probability",
      definition:
        "The likelihood a team wins their current matchup, derived from Vegas betting odds (moneylines).",
    },
    {
      term: "Advance Probability",
      definition:
        "The cumulative probability a team reaches a specific playoff round. Calculated by multiplying win probabilities across rounds.",
    },
    {
      term: "Prop-Based Projection",
      definition:
        "Projection derived from betting market prop lines (over/unders on yards, TDs, etc.). Generally reflects sharp money and market consensus.",
    },
    {
      term: "Historical Projection",
      definition:
        "Projection based on the player's actual playoff performance this season. More recent games are weighted more heavily.",
    },
    {
      term: "Blended Projection",
      definition:
        "Combines prop-based and historical projections. The blend ratio adapts based on data quality and availability.",
    },
    {
      term: "Confidence Level",
      definition:
        "Indicates how reliable a projection is. High = multiple data sources; Medium = limited data; Low = mostly estimated.",
    },
    {
      term: "Weather Impact",
      definition:
        "Adjustment applied to projections for outdoor games with significant weather. High wind, cold, or precipitation reduces passing/kicking projections.",
    },
    {
      term: "Projection Range",
      definition:
        "Shows the low (10th percentile) and high (90th percentile) outcomes. Wider ranges indicate more uncertainty.",
    },
    {
      term: "Champ %",
      definition:
        "The probability a player's team makes and wins the Super Bowl. Product of all remaining playoff round win probabilities.",
    },
    {
      term: "Remaining EV",
      definition:
        "Sum of expected values across all remaining playoff weeks. Accounts for diminishing probability of advancing each round.",
    },
  ];

  return (
    <div className="space-y-3">
      {terms.map((item) => (
        <div key={item.term} className="border-b border-gray-800 pb-2">
          <dt className="font-semibold text-[var(--chalk-yellow)] text-sm">{item.term}</dt>
          <dd className="text-xs text-[var(--chalk-muted)] mt-1">{item.definition}</dd>
        </div>
      ))}
    </div>
  );
}

/**
 * Button to open the methodology modal
 */
export function MethodologyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[var(--chalk-surface)] hover:bg-[var(--chalk-border)] border border-[var(--chalk-border)] rounded transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 text-[var(--chalk-muted)]"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      <span className="text-[var(--chalk-muted)]">How it works</span>
    </button>
  );
}
