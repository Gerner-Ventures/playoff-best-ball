# Demo & Test Environment — Design

Status: approved 2026-08-29

## Problem

The platform cannot be verified end to end. There is no way to see the site as a user
would during the playoffs (P0), during a draft (P1), or before a draft (P2), because
there is no way to *get* the app into those states.

- No league/user/draft seed exists. `prisma/seed-players.ts` seeds players and nothing
  else; the only routes to a populated league are clicking through the whole UI or
  reading a Vitest file.
- `data/players-2026.json` holds 39 players. `startDraftForLeague`
  (`src/domain/draft/start-draft.ts:43-60`) validates the pool can fill every roster, so
  a 12-team league throws `InsufficientPlayerPoolError` before the draft starts. A
  12-team draft is currently impossible.
- The simulated season is fabricated: `advanceMockWeek` invents one KC-vs-BUF game per
  week with seeded-random stat lines. A scoring bug is indistinguishable from correct
  output because there is no ground truth.
- Preview deploys have no working database (the follow-up acknowledged in PR #33). There
  is nowhere to send a link.

## Key insight

**Phase is entirely data-derived; no clock control is needed.** There is no mode enum in
the codebase. Phase emerges from data:

| Phase | Determined by |
|---|---|
| Pre-draft (P2) | No `Draft` row exists for the league |
| Draft (P1) | `Draft.status = ACTIVE` + `currentPickIndex` + future `currentDeadline` + `order` |
| Playoffs (P0) | `Draft.status = COMPLETE` + `NflGame` rows + `PlayerStat` rows |

Current week, eliminated teams and `nextWeek` are computed from game rows
(`src/domain/stats/eliminated-teams.ts`, `src/lib/league-projections.ts:52-55`), never
from `Date.now()`. Write the right rows and every screen follows.

## Findings that shape the design

1. **Missing SCHEDULED games silently blank PREMIUM projections.** `syncWeekStats` upserts
   an `NflGame` row for every game the provider returns (`sync-week.ts:26-40`); the
   `SCHEDULED` skip at line 43 only suppresses *stat* fetching. But `buildMockWeek` only
   ever emits `FINAL`, so after syncing weeks 1..N, weeks N+1..4 have no rows at all.
   `getLeagueProjections` computes `nextWeek = min(week where state !== "FINAL")` and
   returns `{nextWeek: null, entries: []}` (line 55). The 48h preview window in
   `due-work.ts` never fires either. **A source must emit the full 4-week bracket up
   front** — FINAL through N, SCHEDULED after.

2. **ESPN's roster endpoint has no history.** `fetchTeamRoster(_season, team)`
   (`espn-provider.ts:33`) ignores the season; `/teams/{abbr}/roster` returns *today's*
   roster. Players who changed teams or retired would be missing, `syncWeekStats` would
   report them `unmatched`, and their points would silently vanish. **Derive the pool
   from the captured box scores**, which carry `externalId`/`name`/`nflTeam`, and use the
   roster endpoint only to resolve positions.

3. **The password escape hatch cannot work on a deployed demo.** `src/lib/auth.ts:21`
   requires `NODE_ENV !== "production"`; every Vercel deploy is `NODE_ENV=production`.
   Neither `NODE_ENV` nor `VERCEL_ENV` distinguishes a demo deploy from real production.

4. **The `statsProvider` seam must stay empty.** `stats-provider.ts:19` deliberately builds
   an *empty* `FakeStatsProvider` so crons are harmless no-ops. `statsSyncDaily`
   (`inngest/functions.ts:262`) syncs **all four weeks unconditionally** — a fixture-backed
   seam would finalize the entire season on its first 6am tick, and `statsSyncLive` would
   advance the demo whenever a shifted `startsAt` slipped past.

5. **`advanceMockWeek`'s next-week query breaks once a full schedule exists.** It is
   `findFirst({ eventId: { startsWith: "mock-" }, orderBy: { week: "desc" } })`, which
   returns 4 as soon as the seeder writes weeks 1-4 and cannot see historical rows. The
   rule becomes "lowest non-FINAL week", mirroring the app's own derivation.

6. **Demo users cannot be hand-written.** Better Auth's password hash is internal, so the
   seeder must call `auth.api.signUpEmail` — which only works where demo mode is enabled.
   That coupling is the desired safety property.

7. **`syncPlayerPool` is 2-3 queries per player** (~1200 round-trips for 420 players) and
   sits on the demo's critical path — worse than the known `TODO` in `seed-players.ts`.

8. **`createLeague` enforces one FREE league per commissioner** unless they already own a
   PREMIUM one this season. The seeder must create PREMIUM first, or it throws.

## Decisions

- **Data:** two captured postseasons — the 2024 season (playoffs Jan 2025) and the 2023
  season (Jan 2024) — **plus** the existing synthetic generator, retained and switchable.
  Capture 2024 first; `espn-parse.ts` was verified against recent seasons and the `drives`
  subtree that field-goal distances depend on thins out for older ones.
- **Demo env:** a separate Vercel project from the same repo, production branch `main`, own
  Neon database. `VERCEL_ENV=production` there, so `scripts/vercel-build.sh:32` runs
  migrations unchanged. Pointing at `main` (not a `demo` branch) means the demo never
  drifts from prod and adds no second review surface; the demo is defined *entirely by its
  environment*.
- **Sign-in:** known-password demo accounts behind four independent factors (below).
- **Seeded world:** two leagues, one persona — a 12-team PREMIUM league and a smaller FREE
  league (`FREE_TIER_MAX_ENTRIES = 10` forces 12 teams to be PREMIUM).
- **Source coherence:** runtime input with a DB witness (`eventId` prefix `mock-` vs
  `h<year>-`), not a schema column. Mixing sources within a season throws.
- **`startsAt`:** anchored to `Date.now()` at seed time, with a demo-only re-anchor cron.

## The demo-mode gate

Password auth on a public host is the highest-risk part of this work. Four independent
factors, three in the environment and **one out of band**:

1. `DEMO_MODE === "1"` — explicit opt-in; absent means off and nothing else is evaluated.
2. The host parsed from `BETTER_AUTH_URL` is in a **compiled-in** allowlist. Adding a host
   is a reviewed code change, not an env edit. `BETTER_AUTH_URL` is the right signal
   because the app already treats it as canonical, so it must be correct or the demo
   doesn't work — self-enforcing rather than decorative.
3. Negative production signals **refuse to boot**: a production hostname, or
   `stripeModeFromKey() === "live"` (reusing the existing tested helper). An unknown host
   is fatal too — never a silent off.
4. A `DemoEnvironment` sentinel row that exists **only in the demo database**, inserted by
   an operator by hand. Every env-based check lives in the same env store, so a wholesale
   env copy would make all three agree and all be wrong together; a database row cannot be
   copied by an env misclick.

Factors 1-3 resolve synchronously at module scope and throw on a misconfigured deploy, so
it fails at boot rather than serving. Factor 4 is a DB read, so it cannot live in the
Better Auth config (`emailAndPassword.enabled` is evaluated at module init and cannot
await); it is enforced in a wrapper around the auth route's POST for the password paths,
returning 404 to match the existing `isAdmin` convention.

`E2E_TEST_MODE` and `DEMO_MODE` stay **separate flags** sharing one derived predicate.
They have different threat models (`E2E_TEST_MODE` is scoped by `NODE_ENV !== "production"`
and only ever set by `playwright.config.ts`; `DEMO_MODE` must work *with* production
`NODE_ENV` on a public host) and different additional powers. Collapsing them would give
the e2e flag the demo's "works in production" property — strictly worse than today.

## Architecture

`SeasonDataSource` (`src/domain/stats/season-source.ts`) is the seam. Implementations —
synthetic (wrapping the untouched `buildMockWeek`) and historical (reading a committed
snapshot) — both yield the existing `FakeStatsData` shape, so everything downstream is
unchanged. The seeder, the advance lever and the re-anchor cron each construct their own
`FakeStatsProvider` from a source; the global `statsProvider` seam stays empty, which is
what keeps crons from clobbering demo data.

Adding a third season is data-only: drop `data/seasons/<year>/season.json` and it is
discovered by directory scan. The files are read via `fs` at runtime, never a static
`import` (which would inline ~400 KB per season into every route that touches the loader),
so `next.config.ts` needs `outputFileTracingIncludes` for the routes that read them.

## Out of scope

Signed-out public demo mode; per-PR preview databases; replacing `data/players-2026.json`
(it remains the bootstrap for `db:seed:players` and e2e).
