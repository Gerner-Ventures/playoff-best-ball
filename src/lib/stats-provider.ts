// Which StatsProvider the app syncs from. The December beta runs "fake"
// (simulated playoff data, advanced via the admin panel); launch flips to "espn".
//
// CONTRACT (STATS_PROVIDER=fake): nothing ever hits ESPN. The simulated season's
// data is NOT served through this seam — advanceMockWeek (the admin panel's
// "Advance mock week" button, or `npm run mock:week`) writes NflGame + PlayerStat
// rows directly via syncWeekStats with its own pre-fed FakeStatsProvider, exactly
// as the dev script always has. The seam's fake provider is therefore
// intentionally EMPTY: crons and admin sync buttons become harmless no-ops
// (fetchWeekGames returns [], so syncWeekStats upserts nothing and can never
// clobber the mock-written rows), and the one real simulation lever is
// advanceMockWeek.
import type { StatsProvider } from "@/domain/stats/provider";
import { FakeStatsProvider } from "@/domain/stats/fake-provider";
import { espnProvider } from "@/lib/stats/espn-provider";

export const statsProvider: StatsProvider =
  process.env.STATS_PROVIDER === "fake"
    ? new FakeStatsProvider({ games: [], stats: {}, rosters: {} })
    : espnProvider;
