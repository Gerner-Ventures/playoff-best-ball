# Playoff Best Ball v1 — Product & Technical Design

**Date:** 2026-07-10
**Status:** Approved design, pre-implementation
**Target launch:** Open signups early January 2027, ahead of Wild Card weekend (~Jan 9, 2027)

## 1. Vision

Rebuild the friends-only playoff best ball prototype into a hosted, multi-tenant product where anyone can run an NFL playoff best ball league. A commissioner creates a league, invites their group, everyone drafts asynchronously over hours or days (slow snake draft with "you're on the clock" notifications), and the app runs the season for 5 weeks: auto-optimal best ball lineups, live scoring, leaderboard, weekly recaps.

The origin pain point this product solves: the prototype league's draft happened over text messages across multiple days and was painfully inefficient. The async draft with notifications is the core product, not a feature.

This is a full ground-up rebuild. The existing repo's application code is reference material (scoring engine parameterization, ESPN parsing, projections/props/weather models, admin tooling), not a base to extend.

### Business goal for the 2026-season (Jan 2027) launch

Break even on operating costs while testing monetization mechanisms to learn what works. Revenue is a signal-gathering exercise this season, not the objective.

## 2. Monetization model

### Tiers

| Tier | Price | What you get |
|------|-------|--------------|
| **Free** | $0, one tasteful ad slot | Full core game: create league, invite, async draft, live scoring, leaderboard, scoring presets (Standard / Half-PPR / Full PPR), up to 10 entries, 1 league per commissioner per season. Dues tracking (mark paid + Venmo-link reminder nudges). |
| **Premium league** | ~$25 one-time, per league per season | No ads, custom scoring values, >10 entries, multiple entries per person, multiple leagues per commissioner, analytics suite (projections, win probabilities, live prop tracking). |
| **Dues collection** | Fake door only in v1 | "Collect dues automatically" appears in league setup with a price shown; clicking joins a waitlist. Measures willingness-to-pay with zero compliance exposure. |

### Money-handling boundary

Prize money **never touches the platform** in v1. Commissioners handle buy-ins via Venmo as they already do. The platform provides dues *tracking* (who has paid, reminder nudges linking to the commissioner's Venmo) which is legally clean. Real dues collection would require Stripe Connect (money flows directly to the commissioner, platform takes an application fee, never holds funds) plus state-by-state fantasy pool law review — deferred until the waitlist proves demand.

### Monetization gates (anti-viral-blowup protection)

Built in at launch so a usage spike converts to revenue rather than a bare infra bill:

1. **Free league size cap: 10 entries.** The 11th join triggers a Premium upgrade prompt for the commissioner.
2. **One free league per commissioner per season.** A second league requires Premium. Joining leagues as a member is unlimited and always free.
3. **Cost-side (not user-facing):** stats fetched from the provider once per sync cycle and fanned out from our DB — marginal cost per league is ~zero. Rate limiting and caching throughout.

**Principle:** gates sit on commissioners at moments of obvious value; members are never gated — they are the growth engine.

### Pricing context (market comps)

Archetype league: 10 friends, $50 buy-in, $500 pot, one commissioner, existing group chat. RunYourPool/OfficeFootballPool charge $29–49 per pool-season for commissioner-pays hosting; LeagueSafe charges $1–3/member for dues handling; Sleeper/ESPN are free but don't offer playoff best ball. The fee must be trivial next to the buy-in — $25 is 5% of the archetype pot.

Honest revenue picture: 100 premium leagues ≈ $2,500; ads at launch scale earn a few hundred dollars at most (cost offset, not a business). All revenue lands in a ~6-week window in January.

## 3. Product decisions (settled)

| Area | Decision |
|------|----------|
| Draft format | **Slow async snake draft** with exclusive players. Turn-based over hours/days, pick clock per league, notifications on your turn, autodraft on timeout. No live realtime draft room in v1. |
| Platform | **Responsive web + installable PWA** (web push) with **SMS/email fallback** for notifications. No native app in v1. |
| Auth | **Google + Apple OAuth, email magic link fallback.** No passwords. Phone number collected optionally at draft time, framed as "get texted when you're on the clock." |
| League config | **Scoring presets free (Standard / Half-PPR / Full PPR); full custom scoring values are Premium.** Roster shape is fixed in the v1 UI (QB, RB, RB, WR, WR, TE, FLEX, K, DST) but stored **as data** (per-league ordered slot list), so future roster configurability (superflex, 2QB, no-K) is a UI change, not a migration. |
| In-season experience | Scoreboard **plus engagement layer**: pre-weekend "your players this weekend" previews, post-weekend recaps with standings movement, elimination/clinch scenario tracking. Premium adds projections/win-odds/live-props views. **No in-app chat** — leagues already have group chats; don't compete. |
| Substitutions | Injury substitution system carries over as a **commissioner-controlled league setting, off by default** (original player's pre-injury points + substitute's post-injury points). |
| Stats data | **Unofficial ESPN API behind a `StatsProvider` abstraction.** Licensed feeds ($500+/mo) kill break-even. Mitigations: manual score override in admin panel, sync-failure alerting, provider swappable as an adapter. Residual risk (mid-playoffs parser hotfix) accepted. |

## 4. Technical stack

**Hybrid of Vercel serverless for the app runtime + gv-infra conventions for everything vendor-neutral.** Rationale: the workload is consumer, seasonal (~6 live weeks/year), and bursty (game-day traffic spikes, Super Bowl Sunday worst case) — serverless autoscale fits, and everything scales to ~zero March–December. The gv-shared DOKS cluster was evaluated (marginal infra cost ~$0 since it already runs) but game-day burst capacity planning and consumer-MAU auth pricing made Vercel the better fit for the app itself. If Vercel costs ever annoy, Next.js containerizes onto gv-shared later.

| Concern | Choice | Notes |
|---------|--------|-------|
| App | **Next.js (App Router, TypeScript)** on **Vercel** | One codebase, PWA-installable |
| Database | **Neon Postgres + Prisma** | Same vendors as prototype and Canon |
| Auth | **Better Auth** | Google/Apple/magic-link; sessions and identities live in our Postgres; no per-MAU vendor pricing |
| Payments | **Stripe Checkout** | Hosted page, one-time premium purchase per league-season; products/prices managed via Terraform |
| Background jobs | **Inngest** | Durable delayed functions for draft pick clocks and autodraft timeouts; crons for score sync and scheduled notifications. Draft clocks survive deploys and crashes. |
| Email | **Resend** | Transactional: magic links, invites, draft alerts, recaps |
| SMS | **Twilio** | Draft turn alerts; ~$0.01/message |
| Push | **Web Push** (VAPID) | For installed PWA users; iOS requires add-to-home-screen, hence SMS/email fallback |
| Analytics/errors | **PostHog** | Consistent with other Gerner Ventures products |
| Secrets | **Doppler** | gv-infra convention |
| Vendor config | **Terraform** | Stripe products, DNS, PostHog project — gv-infra module patterns |
| Realtime | **Short polling** (2–5s while viewing an active draft or live games) | No WebSockets in v1; a slow draft doesn't need them |

**Load-bearing architecture rule:** the stats provider is fetched once per sync cycle into our DB; every league view is computed from our DB. Cost and rate-limit exposure stays flat regardless of league count.

## 5. Data model (core entities)

- **User** — auth identity (via Better Auth), optional phone, notification preferences per channel
- **League** — season year, tier (FREE/PREMIUM), invite code, settings
- **Membership** — user ↔ league, role (COMMISSIONER / MEMBER)
- **Entry** — a team in a league, owned by a membership; Premium allows multiple entries per membership
- **LeagueSettings** — scoring values (JSON; from preset or Premium-custom), roster slots as an ordered list of slot definitions, pick clock duration (2h/4h/8h/24h), overnight clock pause on/off, substitutions on/off, entry fee (display only, for dues tracking)
- **Draft** — state machine (SCHEDULED → ACTIVE → COMPLETE), snake order (randomized or commissioner-set)
- **DraftPick** — order index, entry, player, deadline, made-at, was-autodrafted
- **DraftQueue** — per-entry pre-ranked player list for autodraft
- **Player** — playoff player pool per season (position, NFL team, external IDs)
- **PlayerStat** — per-player per-week **raw stats stored once**; fantasy points computed per league's scoring settings at read time (cached)
- **Substitution** — per-entry original/substitute player with effective week
- **LeaguePurchase** — Stripe payment records per league
- **DuesStatus** — per-entry paid/unpaid, marked by commissioner
- **DuesCollectionInterest** — fake-door waitlist entries
- **Projection / TeamOdds / PlayerProp / GameWeather / LivePropStatus** — carry over from the prototype roughly as-is, feeding Premium analytics

All league-scoped tables carry the league ID; every query is league-scoped (application-level multi-tenancy).

## 6. Key flows

### League creation and joining
Commissioner wizard: name → expected entries → scoring preset → pick clock → draft start time → invite link (`/join/CODE`) to paste into the group chat. Member taps link → Google/Apple one-tap or magic link → claims an entry. The 11th entry or a commissioner's 2nd league routes through a Stripe checkout interstitial.

### Async draft
Commissioner starts the draft (order randomized or manually set). On each turn: pick deadline = now + league pick clock, with optional overnight pause (clock frozen 1am–8am ET). The on-the-clock user is notified via push + SMS + email with a deep link to the pick screen. Members maintain a pre-draft queue; on timeout, autodraft takes the top available queued player, falling back to best projected available. Each pick (or timeout) advances the state machine via a durable Inngest job. The draft board polls every few seconds while being viewed.

### Season engine
Inngest cron syncs the stats provider every ~2 minutes during live game windows (schedule-aware), daily otherwise. Sync writes raw stats → per-league fantasy points → best-ball optimal lineups → leaderboard. Player detail pages show game-by-game scoring breakdowns (prototype parity). Playoff weeks map 1=WC, 2=DIV, 3=CONF, 4=SB (the prototype's week-5 Super Bowl quirk is not carried forward; bye handling is explicit).

### Engagement notifications
Pre-weekend: "your players this weekend" preview. Post-weekend: recap with points, standings movement, and elimination/clinch scenarios ("you need Mahomes to outscore Allen by 12"). All reuse the draft notification channels; per-channel opt-out per user.

### Money
Premium upgrade via Stripe hosted checkout at gate moments or from league settings. Dues tracking panel on the league page for the commissioner. "Collect dues automatically" fake door with a displayed price joins a waitlist and records the league context.

## 7. Reliability and error handling

- **Sync failures:** alert (Slack webhook) after N consecutive provider failures; syncs are idempotent and resumable.
- **Manual override:** platform admin panel (gated to operators) supports manual stat/score correction, player pool management, external ID matching, and sync health — evolved from the prototype's admin. If ESPN breaks mid-playoffs, manual entry keeps leagues alive while the parser is hotfixed.
- **Draft durability:** pick clocks are durable Inngest jobs; deploys and crashes never eat a timer.
- **Provider abstraction:** all ingestion behind `StatsProvider`; ESPN is the v1 adapter; `FakeStatsProvider` for tests and beta.

## 8. Testing strategy

- **Unit (exhaustive):** scoring engine, best-ball lineup optimizer, and draft state machine as pure TypeScript modules — these are the correctness-critical cores.
- **Integration:** API routes against a test database.
- **E2E (one happy path, Playwright):** create league → join → draft → scores appear on leaderboard.
- **`FakeStatsProvider`** simulates a full playoff run, powering both tests and a December beta with mock live data before real games exist.

## 9. Build phases

| Phase | Window | Scope |
|-------|--------|-------|
| 1. Foundation | Aug–Sep 2026 | Repo rebuild, auth, league/membership/entry model, league creation + invites |
| 2. Draft | Sep–Oct 2026 | State machine, pick clocks, autodraft, queue, notification channels — the centerpiece |
| 3. Season engine | Oct–Nov 2026 | StatsProvider + ESPN adapter, scoring, optimizer, leaderboard, player pages |
| 4. Monetization + engagement | Nov 2026 | Stripe, gates, ad slot, dues tracking + fake door, recaps, premium analytics |
| 5. Beta + hardening | Dec 2026 | Mock-data beta with the original league + 2–3 friend leagues, load sanity check, polish |
| 6. Launch | Early Jan 2027 | Open signups ahead of Wild Card weekend |

## 10. Explicitly out of scope for v1

- Live realtime draft room (next-season candidate; add Pusher/Ably then)
- Native mobile app (PWA + SMS covers v1; revisit if season proves demand)
- Real dues collection / Stripe Connect (fake-door validated first)
- In-app chat or social feed
- Roster-shape configuration UI (data model supports it; UI next season)
- Multi-sport, regular-season, or non-NFL anything

## 11. Open items

- Product name and domain (currently "Playoff Best Ball"; decide before launch marketing, not before implementation)
- Exact Premium price point ($20–30 range; A/B or just pick $25 at Stripe setup time)
- Ad network choice for the single free-tier ad slot (decide in Phase 4; AdSense is the default assumption)
