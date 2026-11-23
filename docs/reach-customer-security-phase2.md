# REACH Phase 2 — separate customer identity and workspace authorization

Status 2026-11-23: implemented on a **feature branch**, stacked on Connections 3.0 PR #33. No production merge, provider authorization, or database change.

## Current vs target
- Platform owner: existing `agency_portal_session` password login; full platform/developer access. **Unchanged.**
- Customer: Neon Auth-issued signed identity assertion validated against the **pinned Neon JWKS**, exact issuer and audience, expiration and algorithm. Exchanges for an independent HttpOnly, SameSite=Strict 15-minute `reach_customer_session`. Never accepts the owner cookie as a customer identity or caller-supplied role.
- Workspace authorization: no global customer workspace list. Each customer call queries `agency_platform_memberships` using `neon_auth:<verified-sub>`, with parameterized queries, returning only authorized `agency_platform_workspaces`. Per-workspace `requireCustomerWorkspace(identity,id,permission)` must gate every future business endpoint.
- Role matrix: `viewer` may read, `instructor` may read/edit content, `client_editor` may read/edit content, `client_owner` may manage membership. **External actions default DENY for all roles**, including owner, until specific consent policy and separate provider route is approved.
- The customer API `GET /api/reach/customer/workspaces` is read-only and requires this customer cookie. `GET /api/reach/customer/workspaces?workspaceId=...` rejects arbitrary cross-tenant workspace IDs. `GET/POST/DELETE /api/reach/customer/session` handles session check, verified assertion exchange, and local logout.
- Existing `/connections`, `/api/platform/social/meta/*`, owner vault, Command Center, and developer console **remain owner-only**. Customer social-read APIs need additional per-account RLS audit before being exposed to tenants.

## Database boundary / threat model
A dedicated runtime database role `reach_customer_runtime` may be granted **SELECT only** on membership columns and workspace name/id/slug. It cannot read Meta token tables, owner vault, client application secrets, other business data, or modify any database records. The app only issues query parameters from **verified** identity claims, not from arbitrary user roles. Use separate `REACH_CUSTOMER_DATABASE_URL` in private Vercel settings; never reuse `AGENCY_PLATFORM_DATABASE_URL` or the production owner runtime role.

This is **application-level** tenant authorization with a restricted database reader; it does not yet add comprehensive Postgres RLS to every REACH feature table. Before enabling customer reads/writes beyond membership metadata, independently test proper RLS for every customer table and role. Session expiry is 15 minutes; removing membership blocks subsequent workspace reads immediately, but an identity-provider sign-out does not by itself revoke the short-lived REACH cookie. Add revocation checking and customer session tracking before wider rollout.

The existing production project has **no Neon Auth integration enabled** (checked read-only). Hence the new customer identity routes default to **503 unavailable**: no insecure fallback to owner sessions, demo accounts, or bypass. No credentials, Neon Auth integration, or role grants have been activated.

## Activation gates — not authorized on this branch
1. Provision Neon Auth on a **dedicated isolated Neon branch first**; configure email verification, recovery, trusted Preview origin, login throttling and audit, then a test customer account.
2. Review the official Neon Auth Next.js server integration and finalize the real login UI/SDK handoff. The Phase 2 API accepts **Neon Auth JWT assertions**, not opaque `getSession().session.token` cookie tokens.
3. Independently create `reach_customer_runtime` via Neon with restricted privileges. Review (but do not apply on this branch) `db/reach-customer/V001__read_only_customer_membership_grants.sql`, in the correct tenant database. Confirm no provider access grants.
4. For each verified Neon Auth identity, provision membership `identity_subject='neon_auth:' || <sub>` in the existing `agency_platform_memberships` table via a **separately approved owner workflow**. No customer self-registration or default membership grants.
5. Configure in Vercel **Preview only**, never a public client environment:
   - `REACH_CUSTOMER_AUTH_ENABLED=true`
   - `REACH_CUSTOMER_AUTH_ISSUER=https://<Neon Auth HTTPS origin>`
   - `REACH_CUSTOMER_AUTH_JWKS_URL=https://<matching Neon JWKS endpoint>`
   - `REACH_CUSTOMER_AUTH_AUDIENCE=<exact Neon Auth JWT audience>`
   - `REACH_CUSTOMER_SESSION_SECRET=<independent 32+ character secret>`
   - `REACH_CUSTOMER_DATABASE_URL=<postgresql URL for reach_customer_runtime>`
6. Test two independent test customers, two workspaces and all four roles. Demonstrate cross-tenant denial, expired/tampered assertion rejection, session expiry, member revocation, and 403/404/503 responses, before connecting any external provider.
7. Do not merge into production until Phase 2 owner approval and security review. Do not enable Instagram Unified Login, automated refresh, email/SMS, publishing, or external actions in this milestone.

## Design references
- Neon Auth for Next.js, server-issued JWT vs opaque session cookie:
  https://github.com/neondatabase/neon-js/blob/main/packages/auth/NEXT-JS.md
- https://neon.com/docs/auth/authentication-flow

## Remaining work
Actual Neon Auth provisioning, customer sign-in UI/managed SDK, invitation workflow, DB membership provisioning, complete customer session revocation, cross-provider workspace RLS and automated customer notifications. No simulated connected customer credentials in Preview.
