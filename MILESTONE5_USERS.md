# Five-user staging limit — Agency Control

## Decision

The application is intentionally limited to **five human users across the entire agency**, including the existing agency administrator. This is **not** five per customer, five per workspace, or five concurrently open browser tabs.

- Seat 1: the existing single administrator login (legacy password mechanism).
- Seats 2–5: at most four **reserved** individual accounts.
- Disabled reservations do not consume a seat.
- A reservation does not create an authenticated user, send an invitation or grant client access.
- The legacy administrator password can be shared outside the roster, so it is NOT yet a verified five-distinct-human identity system. The final system must move to per-person identity and reject unregistered identity subjects on every protected route before exposing client access.

## Implemented

- Global database table `agency_platform_user_capacity` with `max_users=5` enforced by a SQL constraint.
- `agency_platform_users` table: unique normalized emails, roles `client_owner`, `client_editor` and `viewer`, and reservation status. A unique system admin identity cannot be disabled or removed through the API.
- SQL trigger increments/decrements seat occupancy transactionally and rejects the sixth active/reserved seat, even under concurrent writes.
- `GET /api/platform/users`: admin-only roster and counts.
- `POST /api/platform/users`: admin-only seat reservation; returns `invitationSent:false`.
- `PATCH /api/platform/users/:id`: admin-only disable/re-reserve; does not create a login.
- `User Seats (5)` section in the agency portal.
- Reversible migration under `migrations/005_five_agency_users.sql`. The migration was applied only to **the separate staging branch** and is not automatically run by the production app.
- Tests for email/role validation, admin-only API routes and database limit.

## Staging resources / test

GitHub: `feature/agency-five-seats-stage-20261029`
Neon: `br-polished-river-b59f8vaw` in existing `red-tree-98955858` project, database `agency_platform`.

The SQL smoke test:
1. Seeded one immutable system admin.
2. Reserved four synthetic users; occupied reached five.
3. The sixth reservation failed with PostgreSQL check violation.
4. Concurrently requested two reservations when four seats were occupied: exactly one succeeded and the other failed.
5. Disabled and deleted all synthetic test reservations. Final count: **one occupied, four remaining**.

No actual customer emails were invited or connected.

## Authentication boundary

Existing `AGENCY_PORTAL_PASSWORD_SHA256` and `AGENCY_PORTAL_SESSION_SECRET` are single-admin provisional credentials. The seat registry is administrator-only until identity integration. Before activating five separate real logins:

1. Adopt managed OIDC with verified email and organization membership.
2. Bind each authenticated `sub` to one individual seat row and refuse access for unregistered/disabled subjects.
3. Verify invitation acceptance against capacity (including pending invitations) with one-time tokens, email verification, expiry and replays prevented.
4. Add secure sign-in rate limits, session revocation, role-based workspace checks and audit events.
5. Move only validated routes to a protected staging project, then test all five accounts and a sixth-user rejection.

## Release boundary

Production deployment and database remain unchanged. No GHL scan/import, social provider OAuth/publishing, emails, media uploads, or billing is enabled. The private staging Blob store remains unlinked.
