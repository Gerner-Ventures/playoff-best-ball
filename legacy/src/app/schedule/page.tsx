import { PlayoffBracket } from "@/components/playoff-bracket";

export const dynamic = "force-dynamic";

export default function SchedulePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-[var(--chalk-yellow)] chalk-text">
          Playoff Schedule
        </h1>
        <p className="text-sm text-[var(--chalk-muted)] mt-1">
          Click any game to see fantasy scoring details
        </p>
      </div>

      <PlayoffBracket />
    </div>
  );
}
