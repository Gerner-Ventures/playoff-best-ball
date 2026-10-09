---
title: "Security Hardening: API Authentication"
status: resolved
owner: ng
team: playoff-best-ball
ticket_project: Gerner-Ventures/playoff-best-ball
created: 2026-02-26
updated: 2026-08-30
tags: [security, authentication, api]
---

# Security Hardening: API Authentication

**Resolved by the v1 rebuild, not by patching the endpoints this spec named.**

## 1. What this described

Written 2026-02-26 against the prototype, where every API route was reachable without
authentication: admin player/roster/substitution management, and the write/sync
endpoints for stats, odds, props, projections and cron.

**Related:** [#11](https://github.com/Gerner-Ventures/playoff-best-ball/issues/11),
[#12](https://github.com/Gerner-Ventures/playoff-best-ball/issues/12)

## 2. Why it is resolved

Every route this spec named was deleted in the ground-up rebuild — `/api/sync`,
`/api/props`, `/api/odds`, `/api/cron`, `/api/admin/players`, `/api/admin/rosters`,
`/api/admin/substitutions` and `/api/admin/health` no longer exist. The rebuild put
authorization on every route from the start rather than retrofitting it, so the
acceptance criteria below are met by construction.

Audit of every route under `src/app/api`, 2026-08-30:

| Routes | Gate |
|---|---|
| `admin/stats`, `admin/sync/pool`, `admin/sync/week`, `admin/mock/advance-week` | `isAdmin(user)` — platform operators via `ADMIN_EMAILS`; non-operators get **404**, not 403, so a probe cannot distinguish "gated" from "absent" |
| All `leagues/*`, `me/*`, `mock-draft/*`, `join/*`, `players`, `push/subscriptions` | `getSessionUser()`; 401 without a session |
| `webhooks/stripe` | Stripe signature via `constructEvent` |
| `inngest` | Inngest signing key |
| `auth/[...all]` | Public by design (sign-in). The password family is additionally gated by a database sentinel — see below |

There is no unauthenticated write path left, and no cron endpoint to protect: durable
jobs run through Inngest, which signs its own requests, rather than a URL anyone can
hit.

### Acceptance criteria

- [x] All admin endpoints require authentication — `isAdmin`, on all four
- [x] Unauthenticated requests are rejected — 404 for admin, 401 elsewhere
- [x] Admin UI authenticates — `/admin` is a server component behind the same check
- [x] Write/sync endpoints require authentication — the sync routes are admin-gated
- [x] Cron uses a separate mechanism — Inngest signing keys, not an API key on a URL
- [x] Auth mechanism chosen and applied consistently — Better Auth sessions, with
      `isAdmin` layered for operator routes

## 3. Answers to the original open questions

- **Which auth provider?** Better Auth (magic link, plus Google/Apple when configured).
- **Do read-only endpoints stay public?** No. Everything league-scoped requires a
  session, because league data is private to its members.
- **Is the health check admin-only?** Moot — there is no health endpoint. Sync health is
  surfaced inside the admin panel.

## 4. One live caveat

`emailAndPassword` is mounted when the demo deployment attests demo mode via env, and
gated a second time by a `DemoEnvironment` row that only `npm run demo:seed` writes
(`src/app/api/auth/[...all]/route.ts`). `PASSWORD_PATHS` there is a **denylist** of
Better Auth's password routes, so a password route added upstream is unguarded until
it is added to that list. Worth re-checking on a Better Auth upgrade.

Verified against production 2026-08-30: `POST /api/auth/sign-up/email` and
`/sign-in/email` both return 404 on `playoffbestball.com`.
