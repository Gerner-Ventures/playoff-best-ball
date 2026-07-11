import { LiveScoreboard } from "@/components/live-scoreboard";

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--chalk-yellow)] chalk-text">
          2025 Playoff Best Ball
        </h1>
      </div>

      {/* Live Scoreboard */}
      <LiveScoreboard />
    </div>
  );
}
