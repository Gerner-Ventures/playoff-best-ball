# Marketing Foundation — Design

**Date:** 2026-10-09
**Status:** Approved design, pre-implementation
**Scope:** Public marketing site in cobalt, email list with confirmed opt-in, search/sharing basics, invite-link previews. Piece 1 of the year-round plan below.

## 1. Context

The playoffs are about six weeks long. Everything else in the year currently shows a two-line landing page and a pricing page. This piece is the first of three that turn the regular season into the run-up to launch.

### 1.1 The year-round plan

**Goals** (decided 2026-10-09). The content outside the playoffs has three jobs, not a fourth:

1. Build a list before open signups.
2. Earn search traffic in November–December.
3. Keep past players engaged so they come back as commissioners.

It is explicitly **not** a second product: there is no regular-season game. Content must be **fully automated**, meaning nobody writes anything weekly. The list gets an **automated weekly digest**.

**Chosen approach: a marketing foundation plus a live playoff-race engine.** Rejected:
- History-only content. Nothing changes week to week, so the digest has nothing to say.
- A public mock draft as the hook. Its bot pool needs real rankings first, so it comes later.

| Piece | What | Status |
|---|---|---|
| **1. Marketing foundation** | This spec. | Designing |
| 2. Regular-season data engine | Separate regular-season storage. Weekly ESPN FPI import (feasibility confirmed 2026-10-09). Expected playoff points per player = PPG × expected playoff games, including the #1-seed bye. | Spec after this one |
| 3. Data pages + weekly digest | Playoff Best Ball Rankings and Playoff Race pages. Past-postseason history pages. A digest built from week-over-week deltas. | After 1 and 2 |
| Later | Rankings replace `Player.defaultRank` at launch. Public mock draft + ADP. | — |

This reopens the v1 spec's "regular-season … anything" exclusion (§10) for **content only**. Gameplay stays playoff-only.

### 1.2 Calendar

These dates were checked against ESPN's calendar. They correct the v1 spec's "Wild Card ~Jan 9".
- **Now:** 2026 regular season, Week 5.
- **Sun Jan 10, 2027:** Week 18 ends and the playoff field is set.
- **Jan 16–18, 2027:** Wild Card weekend.

Drafts can only run in the ~5.5 days between those two dates. That makes "set up your league before Jan 10" a real message.

### 1.3 Dependencies

- **Cobalt tokens and primitives from #42** must be on `main`. #42 was unblocked on 2026-10-09 (`b08d9be`). The marketing pages are the first light-ground cobalt surfaces; the rest of the app stays chalk until its own conversion.
- Copy comes from the v1 spec and actual product behavior, written once.

## 2. Decisions

| Question | Decision | Rejected alternative |
|---|---|---|
| Design system | Cobalt light ground; marketing is the first converted surface | Wait for the full app conversion (loses regular-season weeks); build in chalk, then rebuild |
| Homepage primary CTA | Email list until `SIGNUPS_OPEN_AT`, then "Start your league — draft opens Jan 10" | League creation now (leagues sit idle for three months); list only, flipped by hand |
| List ownership | Our own `EmailSubscriber` table, sent through our existing Resend account | Resend Audiences/Broadcasts (list outside our DB, no per-user personalization); a newsletter platform (would require exporting user data) |
| Opt-in | Double opt-in: confirm by email | Single opt-in (bots and typos hurt sender reputation on a domain that also sends magic links) |
| Existing account holders | Digest on by default, unsubscribe link plus a settings toggle | Opt-in prompt (far fewer past players re-engage) |
| Marketing sender | Separate `news.playoffbestball.com` subdomain | Reuse `transactional.` (marketing complaints would hurt magic-link delivery) |
| Rendering | Static marketing pages; session read moved out of the root layout | Keep per-request rendering (slower, not CDN-cacheable) |
| Invite links | Public signed-out invite page with a rich share preview | Keep the redirect to sign-in (group chats show a generic card) |
| Ongoing content | None in this piece; all copy written once | Blog/CMS (no editorial capacity) |

## 3. Pages

All of these live in a `src/app/(marketing)/` route group. URLs are unchanged.

| Route | Content |
|---|---|
| `/` | **Hero** with the phase-dependent CTA (§4.2). **How it works** in three steps: create and invite, a slow draft over days with on-the-clock texts, best ball scores itself through the Super Bowl. **Why best ball for the playoffs**: no lineups, every round counts, the #1-seed bye. **Key dates strip** (field set Jan 10, Wild Card Jan 16). Pricing teaser, FAQ teaser, footer signup. |
| `/how-it-works` | Full explainer: async snake draft and pick clock, autodraft, best-ball auto-lineups, eliminations, the substitution setting. Targets "what is playoff best ball". |
| `/scoring` | Scoring presets (Standard / Half-PPR / Full PPR) and roster slots. **Tables are rendered from the engine's own scoring constants and default slot list**, so the page cannot drift from the code. Targets "playoff best ball scoring". |
| `/commissioners` | Commissioner's guide: setup, invites, draft clock settings, dues tracking (mark paid + Venmo nudges), the Jan 10–16 window, free vs premium. |
| `/pricing` | Rebuilt in cobalt. Still reads `src/lib/pricing.ts`. |
| `/faq` | The current pricing questions merged with general ones. |
| `/subscribe/confirm`, `/subscribe/confirmed`, `/unsubscribe` | Email-flow pages (§5). |

Removed: the chalk landing page and `ChalkPlayDiagram`. Their only use is the landing page; confirm that during implementation.

Components live in `src/components/marketing/`: hero, steps, key-dates strip, FAQ list, signup form, marketing header and footer. They are built on #42's cobalt tokens and primitives. No new token values unless the light-ground pairs in §8.3 require them.

## 4. Rendering and structure

### 4.1 Static pages

- **Marketing layout.** `src/app/(marketing)/layout.tsx` provides the cobalt light ground, a header (How it works / Commissioners / Pricing / Sign in) and the footer.
- **No session reads.** None of the marketing pages read cookies or the session, so they prerender at build time.
- **Root layout change.** `src/app/layout.tsx` stops calling `getSessionUser()`, which today makes every route dynamic.
  - PostHog identification moves into the existing `AnalyticsIdentity` client component, which reads the session in the browser through the better-auth client.
  - Signed-in app routes are otherwise unchanged. Identification happens just after load instead of during server render.
- **`/` must still redirect signed-in users.** The in-page redirect (`src/app/page.tsx:9`) is replaced by `src/proxy.ts`, Next 16's renamed middleware.
  - Its matcher is `/` only. If the better-auth session cookie is present, it redirects to `/dashboard`.
  - This is an optimistic cookie-presence check. `/dashboard` still validates the session, and a stale cookie ends at `/sign-in`, not a loop.

### 4.2 Launch phase

- **`src/lib/launch.ts`** exports `SIGNUPS_OPEN_AT`, a reviewed code constant like `pricing.ts`, and `getLaunchPhase(now): "list" | "signups_open"`.
- **The home page sets `revalidate = 3600`**, so the CTA flips within an hour of the date without a redeploy.
- **`/how-it-works` and `/commissioners`** use the same phase for their closing CTA.
- **`src/lib/season-calendar.ts`** holds the key dates (field set, Wild Card kickoff). Home, `/commissioners` and `/faq` read from it, so it needs one edit per season.

## 5. The list

### 5.1 Data model

```prisma
enum SubscriberStatus {
  PENDING
  ACTIVE
  UNSUBSCRIBED
}

model EmailSubscriber {
  id               String           @id @default(cuid())
  email            String           @unique   // trimmed + lowercased
  userId           String?          @unique
  user             User?            @relation(fields: [userId], references: [id], onDelete: SetNull)
  source           String                     // "home_hero" | "footer" | "how_it_works" | "account" | …
  status           SubscriberStatus
  confirmTokenHash String?          @unique   // sha256 of the emailed token; the raw token is never stored
  confirmSentAt    DateTime?
  confirmedAt      DateTime?
  unsubscribeToken String           @unique   // 32+ random bytes, base64url; embedded in every email
  unsubscribedAt   DateTime?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}
```

- **One row per address.** Unsubscribing lives in one place. The email link, the one-click header and the settings toggle all change the same `status`.
- **User deletion keeps the row.** With `onDelete: SetNull`, the address keeps its unsubscribe state after the account is deleted.

### 5.2 Signup: `POST /api/subscribe`

Input: `{ email, source, website }`, where `website` is the honeypot. It is validated with zod.

| Existing row | Effect | Email |
|---|---|---|
| none | create `PENDING`, new token | confirmation |
| `PENDING`, `confirmSentAt` < 10 min ago | none | none |
| `PENDING`, older | rotate token, update `confirmSentAt` | confirmation |
| `ACTIVE` | none | none |
| `UNSUBSCRIBED` | → `PENDING`, new token | confirmation (consent must be re-proven) |

- **The response is always the same `200 { ok: true }`**, shown as "Check your inbox to confirm". It never reveals whether an address is on the list.
- **Honeypot hits** get the same response and do nothing.
- **The 10-minute throttle** stops the form being used to flood someone else's inbox.

### 5.3 Confirm

- **The email link goes to `GET /subscribe/confirm?token=…`.** That page renders a **Confirm** button and changes nothing on load, because link scanners (Outlook Safe Links and others) prefetch GET links.
- **The button POSTs the token.** If the hash matches a `PENDING` row and `confirmSentAt` is within 7 days, the row becomes `ACTIVE`, `confirmedAt` is set and the token hash is cleared. Then it redirects to `/subscribe/confirmed`.
- **States:** an expired token shows the signup form. An unknown or used token says "already confirmed or not recognized", with the signup form.

### 5.4 Unsubscribe

- **The page.** `GET /unsubscribe?token=…` renders an **Unsubscribe** button, for the same prefetch reason. Its POST sets `UNSUBSCRIBED` and `unsubscribedAt`.
  - The result page offers **Resubscribe**, which takes the row back to `ACTIVE` directly. The token proves control of the address, and this only undoes a mis-click.
- **One-click unsubscribe (RFC 8058).** Every list email carries:
  - `List-Unsubscribe: <https://playoffbestball.com/api/unsubscribe?token=…>`
  - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  - `POST /api/unsubscribe` unsubscribes immediately, with no page.
- **Repeats are harmless.** An unknown token returns 404 to the API and "link not recognized" on the page.

### 5.5 Account holders (on by default)

- **Backfill.** A migration inserts an `ACTIVE` row with `source = 'account'` for every existing `User`.
  - Raw SQL must supply `id`, because Prisma's `cuid()` default is client-side.
  - Both `id` and `unsubscribeToken` come from built-in `gen_random_uuid()`. Postgres 13+ has it without an extension; `gen_random_bytes` would need `pgcrypto`, which is not enabled.
  - The token is two UUIDs concatenated with the dashes removed: 64 hex chars, about 244 random bits.
- **New users.** A better-auth `databaseHooks.user.create.after` hook upserts by email:
  - No row: create it as `ACTIVE`, source `account`, linked to the user.
  - Existing row: link `userId`. `PENDING` becomes `ACTIVE`, because signing in proves the address. `UNSUBSCRIBED` **stays unsubscribed**. `ACTIVE` is unchanged.
  - **The hook never fails sign-up.** Errors are caught and logged, and the settings page repairs a missing row (§9).
- **Settings toggle.** `/settings/notifications` gets a **"Weekly playoff-race digest"** toggle bound to the user's row. Turning it off sets `UNSUBSCRIBED`; turning it on sets `ACTIVE`.
- **Notice in the first email.** Piece 3's first digest to account holders explains why they're receiving it. That's a piece-3 copy requirement, noted here so it isn't lost.

### 5.6 Sending

- **Module.** `src/lib/email/marketing.ts` sends list mail through Resend from `MARKETING_FROM_EMAIL`, e.g. `Playoff Best Ball <hello@news.playoffbestball.com>`.
  - It always attaches the `List-Unsubscribe` headers.
  - It sits behind a small interface so tests use a fake.
- **Only one email in this piece:** the confirmation email.
- **Dev mode.** With no `RESEND_API_KEY`, or outside production with no `MARKETING_FROM_EMAIL`, the confirmation link is logged to the console. This mirrors the magic-link behavior in `src/lib/auth.ts`, with the same "real production fails loudly" rule.
- **Sender domain.** `news.playoffbestball.com` gets its own SPF/DKIM/DMARC in Resend, separate from `transactional.` (runbook step, §11).

## 6. Search and sharing

- **Metadata.** Every marketing page exports static `metadata`: a title from the layout template `"%s · Playoff Best Ball"`, a unique description, and `alternates.canonical`. `metadataBase` is `https://playoffbestball.com`.
- **Sitemap.** `src/app/sitemap.ts` lists the marketing routes. Piece 3 appends the data pages.
- **Robots.** `src/app/robots.ts`:
  - **Production (`VERCEL_ENV === "production"` and not the demo project):** allow the marketing pages; disallow `/api`, `/dashboard`, `/leagues`, `/admin`, `/settings`, `/mock-draft` and `/join`; reference the sitemap.
  - **Everything else** (preview deployments, the `playoff-best-ball-demo` project, local): `Disallow: /`.
  - The demo check uses the existing demo-mode signal (`src/lib/demo-mode.ts`).
- **Share images.**
  - One `next/og` template (cobalt ground, page title, wordmark) backs an `opengraph-image` for each marketing route.
  - Twitter card: `summary_large_image`.
- **Not doing:** FAQ rich-result markup. Google limited it to government and health sites in 2023.

## 7. Invite-link previews

`/join/[code]` today redirects signed-out visitors to `/sign-in` (`src/app/join/[code]/page.tsx:10`). Group chats therefore render a generic sign-in card for the single most-shared link in the product.

- **Signed-out visitors** see a public invite page. Signed-in visitors keep the current flow unchanged.
  - **It shows:** the league name, the commissioner's first name only, the draft date (from `draftScheduledAt`, or "draft not scheduled yet") and entries so far out of the maximum.
  - **Its CTA:** "Sign in to join", linking to `/sign-in?callbackURL=/join/{code}`.
  - **Edge states:** an unknown code shows the existing "Invite not found". A full league or a finished draft says so plainly.
- **`generateMetadata`** gives the title "You're invited to {league name}" and a description with the commissioner's first name and draft date.
- **`/join/[code]/opengraph-image.tsx`** renders the invite card from the same data.
- **Indexing.** The page is `robots: noindex` and also disallowed in `robots.ts`.
- **Exposure.** Codes are 8 characters from `INVITE_CODE_ALPHABET` (`src/domain/invite-code.ts`), so they aren't enumerable. Anyone who has a code can already join; the page reveals nothing beyond what joining shows.
- **Rendering.** The page reads the DB, so it stays dynamic, as it is today.

## 8. Analytics, accessibility, performance

### 8.1 Events

Added to `src/lib/analytics-events.ts` following the existing pattern:

| Event | Where | Properties |
|---|---|---|
| `marketing_cta_clicked` | client | `cta`, `page`, `phase` |
| `subscribe_submitted` | client, on success response | `source` |
| `subscribe_confirmed` | server | `source` |
| `unsubscribed` | server | `via`: `link` / `one_click` / `settings` |
| `invite_page_viewed` | client, signed-out only | none (no league identifiers) |

PostHog's automatic pageviews and UTM capture are unchanged. The funnel is visit → submitted → confirmed, split by page and source. Joining subscribers to the leagues they later create is deferred to piece 3.

### 8.2 Contrast check in CI

#42's `scripts/check-contrast.mjs` is not wired into anything. This piece:
- adds an `npm run check:contrast` script and a `ci.yml` step;
- adds the light-ground pairs the marketing pages actually render to the checked set.

(Fixing the checker's other gaps found in #42's review is Austin's follow-up, not this piece.)

### 8.3 Accessibility and performance

- Every text pair passes WCAG AA, and focus rings reach 3:1 on the light ground.
- Interactive controls are at least 44px on touch.
- No client JavaScript on marketing pages beyond the signup form, CTA click tracking and existing app-wide scripts.
- Images go through `next/image`; fonts through the existing `next/font` setup.

## 9. Error handling

| Situation | Behavior |
|---|---|
| Invalid email | 400 with a field message; the form shows it inline |
| Honeypot filled / throttled resend | Generic `200 { ok: true }`, nothing sent |
| Resend fails on signup | Row stays `PENDING`; response 502 "We couldn't send the confirmation email — try again"; error logged. Never silent. |
| Concurrent signup, same address | Unique-index conflict caught and treated as an existing row |
| Confirm: expired / unknown / used token | Distinct message plus signup form |
| Unsubscribe: unknown token | Page: "link not recognized". API: 404 |
| Create-user hook throws | Logged; sign-up proceeds. `/settings/notifications` upserts a missing row (`ACTIVE`, source `account`) on load. Piece 3's digest sender backfills before each send. |
| Production missing `MARKETING_FROM_EMAIL` / Resend key | Subscribe returns 502 and logs loudly. It does not fall back to console logging. |
| Invite: unknown code / full / draft done | Existing "Invite not found"; plain "league is full" / "draft complete" states |

## 10. Testing

Tests are written before the code they cover, using the repo's vitest-with-Postgres and Playwright setups.

### 10.1 Unit and integration

- **Subscriber state machine:** every row of §5.2, confirm (valid / expired / used / unknown), unsubscribe and resubscribe, one-click, idempotency.
- **Throttle timing** with an injected clock.
- **Account linking:** no prior row; prior `PENDING`; prior `UNSUBSCRIBED` (stays unsubscribed); prior `ACTIVE`.
- **Backfill migration** against seeded users: one `ACTIVE` row each, unique tokens.
- **`getLaunchPhase`** either side of `SIGNUPS_OPEN_AT`.
- **`robots.ts`** output for production, preview and demo. **`sitemap.ts`** contents.
- **Scoring page data** equals the engine's preset constants and default slot list.
- **Marketing sender:** `List-Unsubscribe` and `List-Unsubscribe-Post` present; dev-mode console fallback; production missing-config failure.

### 10.2 End-to-end

- Signed out: home → submit email → read the confirmation link (dev console capture or test hook) → Confirm → confirmed page. Then unsubscribe → resubscribe.
- Signed in: `GET /` redirects to `/dashboard`.
- Signed-out invite link shows the league name and draft date; Sign in returns to the join form.
- Settings toggle flips the subscriber status.

### 10.3 Guards

- **Static rendering:** a check that the build's prerender manifest lists every marketing route. This fails if a session read creeps back into the root layout.
- **Contrast:** the contrast check runs in CI (§8.2).

### 10.4 Manual

- Copy review on the Vercel preview.
- Share images for marketing pages and an invite link checked with a link-preview debugger.

## 11. Rollout

- **Ordering.** #42 merges first. The implementation plan slices this into reviewable PRs, likely:
  1. List backend + settings toggle + backfill.
  2. Marketing pages + root-layout/proxy change.
  3. Search, share images and invite previews.
- **Runbook additions** (`docs/runbooks/production-setup.md`), for the operator:
  1. Resend: add and verify `news.playoffbestball.com` (SPF/DKIM/DMARC); set `MARKETING_FROM_EMAIL` in Doppler → Vercel.
  2. Google Search Console: verify the domain and submit `/sitemap.xml`.
  3. Set `SIGNUPS_OPEN_AT` in `src/lib/launch.ts` (code change, reviewed).
  4. Vercel Firewall: rate-limit `POST /api/subscribe` per IP, **if the plan supports custom rate-limit rules**. Unverified; the implementation checks the plan, and the design does not depend on it.

## 12. Out of scope

- The weekly digest itself, rankings / Playoff Race pages, history pages (piece 3).
- Regular-season data ingestion and the rankings model (piece 2).
- Public mock draft, ADP.
- Blog / CMS / editorial content.
- Converting the rest of the app from chalk to cobalt.
- Linking subscribers to downstream league creation in analytics.

## 13. Open items

- **Exact `SIGNUPS_OPEN_AT` date.** "Mid-December" is the working assumption; Nick picks it.
- **Vercel Firewall rate-limit availability** on the current plan (§11).
