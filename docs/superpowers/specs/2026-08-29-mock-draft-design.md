# Mock Draft — Design

**Date:** 2026-08-29
**Status:** Approved design, pre-implementation
**Scope:** Solo practice draft against bots, standalone from any league

## 1. Purpose

Let a signed-in user practise drafting on their own, immediately, without waiting on anyone. The real draft is deliberately slow — async, hours or days, notification-driven — which makes it a poor place to learn the interface or try a strategy. A mock draft is the fast, disposable counterpart.

It is **not** a league feature. It creates no league, invites nobody, and affects no standings, scoring, projections, or revenue.

## 2. Decisions

| Question | Decision | Rejected alternative |
|---|---|---|
| Audience | One user vs bots | League-wide rehearsal; commissioner settings sandbox; signed-out public demo |
| Setup | Standalone, configurable team count + roster shape | Mirroring an existing league's settings |
| Persistence | Resumable, one per user, discarded on starting the next | Saved history of past mocks; ephemeral browser-only |
| Bot behaviour | Best available with jitter | Strict best-available (deterministic); positional-need weighting |
| Storage | Dedicated `MockDraft` model | Hidden "mock league" reusing `League`/`Entry`/`Draft` |

### 2.1 Why not reuse the real draft engine

The obvious approach is a `League` flagged `isMock` with synthetic `Entry` and `Membership` rows, reusing the draft engine untouched. It was rejected on two grounds.

**Leakage.** Synthetic leagues would sit in the same tables that the recap cron, preview cron, engagement cron, stats sync, and monetization analytics all walk. Every one of those would need a filter, and missing one means emailing users about a league that does not exist.

**The reuse is mostly of machinery this feature does not need.** `applyPickAndAdvance` is transactional and handles `P2002` pick races, stale-timer no-ops, and conflict recovery. That complexity exists because multiple humans and Inngest timers race for the same pick. A solo mock has exactly one actor and no clocks, so none of it applies.

What is genuinely worth sharing is the *rules* — snake order and slot eligibility — and those are pure functions this design reuses directly.

### 2.2 Scoring is deliberately not configurable

Configuring a scoring preset would have no observable effect. Scoring converts stats into points, a mock plays no games, and `Player.defaultRank` is a single column rather than per-preset, so the board does not reorder either. Mock setup configures team count and roster shape only — both of which genuinely change how the draft plays out.

## 3. Data model

```prisma
enum MockDraftStatus {
  ACTIVE
  COMPLETE
}

model MockDraft {
  id               String          @id @default(cuid())
  user             User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId           String          @unique // one in progress per user, DB-enforced
  season           Int
  config           Json            // { teamCount, rosterSlots }
  order            Json            // shuffled seat ids; validated by draftOrderSchema
  humanSeat        String          // which seat in `order` belongs to the user
  picks            Json            // [{ pickIndex, seat, playerId, slotIndex }]
  currentPickIndex Int             @default(0)
  status           MockDraftStatus @default(ACTIVE)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
}
```

`season` is always `CURRENT_SEASON`; the mock drafts from the same player pool as a real league.

Teams are **seats** (`"0"`, `"1"`, …), not `Entry` rows — no synthetic entries, memberships, or users exist anywhere. The user's own seat is `humanSeat`; every other seat is a bot.

`userId @unique` makes "one at a time" a database constraint rather than a convention: starting a new mock is an upsert over the same row. `onDelete: Cascade` means deleting a user removes their mock.

Picks are JSON rather than a relational table. `DraftPick` carries three unique constraints (`[draftId, pickIndex]`, `[draftId, playerId]`, `[draftId, entryId, slotIndex]`) to arbitrate concurrent writers; a mock has one writer and no races, so those constraints would guard nothing.

The draft is complete when `currentPickIndex === totalPicks(teamCount, rosterSlots.length)`; `status` flips to `COMPLETE` at that point and no further picks are accepted.

`status: COMPLETE` exists so the final pick leaves the user on a result screen rather than the mock vanishing at the moment it becomes interesting. It is discarded when the next mock starts.

Draft position is randomised through the existing `shuffleOrder`, so the user does not always pick first.

## 4. Modules

`src/domain/mock-draft/`

| File | Responsibility |
|---|---|
| `config.ts` | `mockDraftConfigSchema`: `teamCount` 2–`PREMIUM_MAX_ENTRIES`, `rosterSlots` reusing `rosterSlotSchema` |
| `bot-pick.ts` | Pure. `(candidates, filledSlots, rosterSlots, rng) => { playerId, slotIndex }` |
| `start.ts` | Upsert the user's mock, shuffle seats, run bots up to the user's first turn |
| `pick.ts` | Apply the user's pick, then run bots until the user is on the clock or the board is full |
| `state.ts` | Derive the view model: board, the user's roster, available players |

Reused unchanged from the real engine: `entryIdForPick`, `totalPicks`, `shuffleOrder` (`draft/snake-order.ts`), `assignSlot` (`draft/slot-assignment.ts`), `DEFAULT_ROSTER_SLOTS` and `rosterSlotSchema` (`league-settings.ts`).

Slot assignment mirrors the real draft exactly: the user picks a *player*, and the slot is derived from that player's position via `assignSlot`. A player whose position has no open slot is rejected, as `makePick` does with `NoSlotForPositionError`.

## 5. Bot algorithm

For the seat on the clock:

1. Take available players ordered by `defaultRank`.
2. Keep only those with an assignable slot for that seat.
3. Take the top `min(5, remaining)`.
4. Choose by weighted random, weighting position *i* in that window as `windowSize - i` — so a full window weights 5/4/3/2/1 and a two-candidate window weights 2/1.

The best available player usually goes but not always, so the board cannot be memorised across runs. `rng: () => number` is injected and defaults to `Math.random`, making the algorithm deterministic under test.

## 6. Flow

Four endpoints. No polling, no clocks, no Inngest.

| Endpoint | Behaviour |
|---|---|
| `GET /api/mock-draft` | Current state, or `null` when none in progress |
| `POST /api/mock-draft` | Create or replace, then run bots to the user's first turn |
| `POST /api/mock-draft/pick` | Apply the user's pick, then run bots to their next turn |
| `DELETE /api/mock-draft` | Discard |

Bots resolve synchronously within the request and every response carries the complete new state, so the client never polls. This is a real simplification over the draft room, which subscribes to a live draft.

UI lives at `/mock-draft`: a setup form (team count, roster shape) when none is in progress, otherwise the draft board. It reuses the chalk design system and the draft room's visual vocabulary.

## 7. Failure handling

| Case | Response |
|---|---|
| Player already taken (stale client) | 409 with fresh state |
| Player's position has no open slot | 422, mirroring `NoSlotForPositionError` |
| Pool exhausted mid-draft | Mark `COMPLETE` early |
| Invalid config | 400 via zod |
| Signed out | 401 |

One deliberate divergence from the real engine: `autodraftCurrentPick` throws on an exhausted pool because that indicates a misconfigured league — a bug worth surfacing loudly. In a mock the user chose the roster shape themselves, so it degrades to a finished draft instead of an error.

## 8. Testing

- `bot-pick` never selects a taken player, never selects one with no open slot, and with a stubbed `rng` returns the expected candidate; the choice always falls inside the top-5 window.
- A 12-team, 9-slot mock runs to completion: every seat holds exactly 9 picks and no player appears twice. The fixture must seed at least `teamCount × slots` players with a workable position spread, or the draft legitimately ends early via the exhausted-pool path and the test fails for the wrong reason. (The dev seed is 39 players — well short of the 108 this case needs.)
- Starting a second mock replaces the first (one row per user).
- The user's pick is rejected when the player is taken, and when their position has no open slot.
- **Drift guard:** the mock's pick order matches `entryIdForPick` for the same inputs.

The drift guard exists specifically to cover this design's known weakness — the orchestration loop is written twice, once against `Draft` and once against `MockDraft`, and nothing else stops the two separating.

## 9. Out of scope

Saved mock history; mirroring a specific league's settings; multiple concurrent mocks; league-wide rehearsal drafts; signed-out demo mode; pick clocks or notifications; any effect on scoring, projections, standings, or analytics.
