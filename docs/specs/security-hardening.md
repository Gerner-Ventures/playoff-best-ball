---
title: "Security Hardening: API Authentication"
status: draft
owner: ng
team: playoff-best-ball
ticket_project: Gerner-Ventures/playoff-best-ball
created: 2026-02-26
updated: 2026-02-26
tags: [security, authentication, api]
---

# Security Hardening: API Authentication

Add authentication to all admin and write/sync API endpoints that are currently publicly accessible.

## 1. Background

<!-- specwright:system:1 status:todo -->

All API endpoints are publicly accessible without authentication. Admin endpoints allow unrestricted access to player management, roster operations, and substitution controls. Write/sync endpoints allow triggering data syncs, updating odds, and running cron jobs without authorization. This exposes the application to data manipulation and abuse.

**Related:** [#11](https://github.com/Gerner-Ventures/playoff-best-ball/issues/11), [#12](https://github.com/Gerner-Ventures/playoff-best-ball/issues/12)

## 2. Admin Endpoint Authentication

<!-- specwright:system:2 status:todo -->
<!-- specwright:ticket:github:11 -->

Add authentication to all routes under `/api/admin/*`:
- `/api/admin/players` — player CRUD
- `/api/admin/rosters` — roster management
- `/api/admin/substitutions` — substitution controls
- `/api/admin/players/overview` — player overview
- `/api/admin/players/unmatched` — unmatched players
- `/api/admin/health` — health check

### Acceptance Criteria

- [ ] All `/api/admin/*` endpoints require authentication
- [ ] Unauthenticated requests receive 401 response
- [ ] Admin UI passes authentication token with API requests
- [ ] Health check endpoint remains accessible (or uses separate auth)

## 3. Write/Sync Endpoint Authentication

<!-- specwright:system:3 status:todo -->
<!-- specwright:ticket:github:12 -->

Add authentication to all write and sync endpoints:
- `/api/sync` — data synchronization
- `/api/odds` and `/api/odds/manual` — odds updates
- `/api/props` — props management
- `/api/projections/sync` — projection synchronization
- `/api/players/update-teams` — team updates
- `/api/cron` — cron job trigger

### Acceptance Criteria

- [ ] All write/sync endpoints require authentication
- [ ] Cron endpoints use a separate API key or service account token
- [ ] Unauthenticated requests receive 401 response
- [ ] Existing data sync flows continue to work with authentication

## 4. Authentication Mechanism

<!-- specwright:system:4 status:todo -->

Choose and implement an authentication mechanism appropriate for a Next.js application with both UI-driven and automated (cron) access patterns.

### Acceptance Criteria

- [ ] Authentication mechanism chosen (e.g., NextAuth, Clerk, or simple API key)
- [ ] Middleware or wrapper applied consistently to all protected routes
- [ ] API keys for cron/sync endpoints stored as environment variables
- [ ] Authentication state persists across browser sessions

## 5. Open Questions

- Which auth provider? (NextAuth with GitHub, Clerk, simple API key for admin?)
- Should read-only endpoints (public scoreboard) remain unauthenticated?
- Is the health check endpoint admin-only or public?
