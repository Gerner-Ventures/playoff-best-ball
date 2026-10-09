import type { Metadata } from "next";
import { rosterReference, scoringReference } from "@/domain/scoring-reference";
import { Section } from "@/components/marketing/section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export const metadata: Metadata = {
  title: "Scoring",
  description: "Playoff best ball scoring rules: standard, half-PPR and full-PPR point values, and the nine-slot roster.",
  alternates: { canonical: "/scoring" },
};

export default function ScoringPage() {
  return (
    <>
      <Section className="pt-16">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Scoring</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Every league picks one of three presets. Premium leagues can change any value. These tables are read straight from the
          scoring engine.
        </p>
      </Section>
      <Section title="Roster">
        <ul className="flex flex-wrap gap-2">
          {rosterReference().map((slot, i) => (
            <li key={`${slot}-${i}`} className="rounded-md bg-brand-tint px-3 py-1 font-mono text-sm font-semibold text-ink">
              {slot}
            </li>
          ))}
        </ul>
      </Section>
      {scoringReference().map((group) => (
        <Section key={group.title} title={group.title}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule text-sm text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">Stat</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Standard</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Half PPR</th>
                  <th scope="col" className="py-2 font-semibold">Full PPR</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.key} className="border-b border-rule">
                    <th scope="row" className="py-2 pr-4 font-normal text-ink">{r.label}</th>
                    <td className="py-2 pr-4 font-mono text-ink-soft">{r.standard}</td>
                    <td className="py-2 pr-4 font-mono text-ink-soft">{r.halfPpr}</td>
                    <td className="py-2 font-mono text-ink-soft">{r.fullPpr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <ClosingCta page="scoring" source="scoring" />
    </>
  );
}
