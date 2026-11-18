# Agency Control — Single Administrator Staging Mode

## Current decision

**One operator only.** The previous five-seat design is superseded and deferred indefinitely. The administrator alone operates the agency dashboard, social planner, content calendar, internal insights, workspace configuration and private-media setup. No invitations, client/member accounts, seat allocations, SSO, role provisioning or user administration should be implemented in this phase.

This does **not** restrict the number of internal workspace records; workspace objects are not login accounts.

## Enforced staging boundaries

- The isolated Neon staging database (branch `br-polished-river-b59f8vaw`) was migrated to `max_users=1`, `occupied=1` and a `CHECK(is_system_admin=true)` constraint on its sole account row.
- A new `006_single_admin.sql` records the change for reproducibility; historical `005_five_agency_users.sql` is superseded and should not be taken as current policy.
- The User Seats navigation and provisioning component have been removed.
- `POST /api/platform/users` and `PATCH /api/platform/users/:id` return HTTP 410 (disabled) without performing database operations.
- `GET /api/platform/users` requires the administrator's session and returns read-only single-administrator capability information without email addresses or other account records.
- The existing staging administrator session and password login are the **only login mechanism**. No per-person login flow exists or is planned.
- GHL scanning/import remains blocked on this feature branch; publishing, Meta OAuth and media uploads are still disabled.

## Operational scope

Focus on making **Social Intelligence** genuinely useful for the single operator: the content studio, internal calendar, audience/channel planning, non-publishing test dispatch, provider readiness, private media storage and direct Meta read-only integration when separately approved.

## Verification

Database constraints should reject an inserted non-admin record, even when the API is bypassed. The actual administrator cannot be disabled. No production schema, deployment, or live client data is changed.

## Caveat

The legacy administrator uses one shared-password session scheme, which does not verify the physical identity of a human across browsers. Do not claim this is one-person identity assurance or safe public customer access. Protect staging preview access and rotate the previously disclosed temporary password before involving real accounts.
