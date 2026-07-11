import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_SCORING_RULES } from "@/lib/scoring/rules";

export default function ScoringPage() {
  const rules = DEFAULT_SCORING_RULES;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-[var(--chalk-yellow)] chalk-text">Scoring Rules</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Passing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-red)]">Passing</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Passing Yards</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-muted)]">
                    1 pt / {rules.passYardsPerPoint} yds
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Passing TD</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.passTd} pts
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">Interception</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-red)]">
                    {rules.passInt} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Rushing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-green)]">Rushing</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Rushing Yards</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-muted)]">
                    1 pt / {rules.rushYardsPerPoint} yds
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">Rushing TD</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.rushTd} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Receiving */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-blue)]">Receiving</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Receiving Yards</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-muted)]">
                    1 pt / {rules.recYardsPerPoint} yds
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Receiving TD</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.recTd} pts
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">Reception (PPR)</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.ppr} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Kicking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-yellow)]">Kicking</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">FG 0-19 yds</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.fg0_19} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">FG 20-29 yds</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.fg20_29} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">FG 30-39 yds</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.fg30_39} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">FG 40-49 yds</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.fg40_49} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">FG 50+ yds</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.fg50Plus} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">FG Missed 0-39 yds</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-red)]">
                    {rules.fgMiss0_39} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">PAT Made</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.xpMade} pts
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">PAT Missed</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-red)]">
                    {rules.xpMiss} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Defense */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-purple)]">Defense/ST</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Sack</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.sack} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Interception</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.defInt} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Fumble Recovery</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.fumRec} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Defensive TD</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.dstTd} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Safety</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.safety} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Blocked Kick</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.block} pts
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">Extra Point Returned</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.xpReturned} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Points Allowed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-orange)]">Points Allowed</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">0 points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.pa0} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">1-6 points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.pa1_6} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">7-13 points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.pa7_13} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">14-20 points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.pa14_20} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">21-27 points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-muted)]">
                    {rules.pa21_27} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">28-34 points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-red)]">
                    {rules.pa28_34} pts
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">35+ points</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-red)]">
                    {rules.pa35Plus} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Miscellaneous */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[var(--chalk-pink)]">Miscellaneous</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">2-Point Conversion</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.twoPtConv} pts
                  </td>
                </tr>
                <tr className="border-b border-dashed border-[rgba(255,255,255,0.1)]">
                  <td className="py-2 text-[var(--chalk-white)]">Fumble Lost</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-red)]">
                    {rules.fumbleLost} pts
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--chalk-white)]">Return TD</td>
                  <td className="py-2 text-right font-medium text-[var(--chalk-green)]">
                    +{rules.returnTd} pts
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
