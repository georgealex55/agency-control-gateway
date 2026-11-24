# REACH Phase 2 — Staging identity, tenant permissions and invitations

Status: **STAGING ONLY**, 2026-11-23. Draft PR #34 is stacked on draft Connections PR #33; neither is merged to main. No production branch, production Neon credentials, Meta connection or external provider grants have changed.

## Real staging environment
- Neon project `red-violet-71016741`; **staging branch** `br-calm-block-bdxsar49` (`reach-phase2-auth-staging-20261123`), created as child of the existing synthetic test branch, not of production.
- Managed Better Auth was provisioned on staging only, using dedicated `neon_auth` tables and its own HTTPS auth origin/JWKS.
- Email/password and mandatory email verification are active, using email OTP; password reset revokes sessions. Organization invitation emails and external action automations remain disabled.
- Two reserved synthetic test identities and two separate test workspaces are present in staging. Alpha is a `client_owner` of Synthetic Alpha; Beta is a `viewer` of Synthetic Beta. **Neither test email is verified**, so the verified-membership view correctly returns no accessible workspace. These are seeded identity fixtures, not evidence that real mailbox-based sign-in has succeeded.
- Production still has no `neon_auth` schema. Production `main`, tokens and the Xander Tech Facebook authorization have not been changed.
- Vercel configuration is restricted to branch-specific Preview variables for `feature/reach-customer-auth-workspace-rbac-20261123`: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `REACH_CUSTOMER_AUTH_ENABLED`, `REACH_CUSTOMER_AUTH_ISSUER`, `REACH_CUSTOMER_AUTH_AUDIENCE`, `REACH_CUSTOMER_AUTH_JWKS_URL`, `REACH_CUSTOMER_SESSION_SECRET`, `REACH_CUSTOMER_DATABASE_URL`, `REACH_CUSTOMER_INVITES_DATABASE_URL`. Secrets are stored as sensitive environment variables; nothing is added to Git.

## Customer login
- Official pinned `@neondatabase/auth@0.7.0-beta` Next.js SDK is installed on this feature branch; its current peer requirement is **Next.js 16**, so this Preview alone uses `next@16.4.6`. Do not merge into production without a separate major-version compatibility review.
- `/api/auth/[...path]` proxies the managed Better Auth service only when feature flags and server-side cookie secret are valid; otherwise it returns unavailable.
- `/customer/sign-in` performs real managed sign-in, obtains the signed JWT from the Neon session, and exchanges it for an **independent** 15-minute REACH customer cookie.
- `/customer/register?invite=...` handles email/password signup and email OTP verification. The invitation link is required for the UI; however Neon Auth currently allows signup and may accept direct API registrations. **Signup never grants workspace access without an invitation or explicit owner-issued membership.**
- `/customer/invite?token=...` redeems a token after sign-in and verifies the email and token against staging database functions.
- The customer cookie is distinct from the existing `agency_portal_session` platform-owner cookie. Owner session cannot authenticate customer APIs, and customer session never enables owner/Meta APIs.
- Neon JWT verification enforces EdDSA (Ed25519) signed by the **pinned branch JWKS**, exact issuer/audience equal to the Auth origin, expected expiration and `emailVerified=true`; session signature and expiry independently validated by REACH.
- A verified person may have **zero** workspaces before accepting an invitation. The customer workspace endpoint returns only granted workspaces and never lists other tenants.

## Tenant enforcement and database roles
- `reach_customer_runtime`: restricted to a verified-membership **view** in schema `reach_customer`, with no access to `public` Meta tokens, `reach_vault` or `neon_auth` internals.
- The view joins `agency_platform_memberships` to `neon_auth.user`, only where `emailVerified=true` and not banned. Server queries always bind the identity's `neon_auth:<sub>` and requested UUID; cross-tenant workspace IDs return 404.
- `reach_invite_runtime`: separate staging role, with executable-only invitation functions in `reach_customer_invites` and no access to secret invite table or provider connections. Its `available_workspaces()` returns only workspace IDs and names for an authenticated platform owner.
- SQL migrations: `V001__read_only_customer_membership_grants.sql` and `V002__staging_workspace_invitation_functions.sql`. They were applied **only to the isolated staging branch**; do not apply to production during this milestone.
- Permissions: `client_owner`, `client_editor`, `instructor`, and `viewer`. All external execution/publishing/messaging remains denied at this stage, regardless of role.

## Invitation flow
- `/developer/meta` contains the owner-only staging invitation form with a real workspace dropdown.
- `POST /api/reach/customer/invitations`: requires same-origin owner session and Vercel **Preview**; issues a cryptographically random, base64url 32-byte token, stores **only SHA-256 hash** in staging, bound to one workspace, one role and lowercase recipient email. Valid for 48 hours; response returns one manual-delivery link and explicitly indicates **no email sent**.
- `POST /api/reach/customer/invitations/accept`: requires a valid customer session, exact bound verified email in Neon Auth, a currently valid unconsumed token, and atomic one-time assignment. Existing membership is not silently upgraded on conflict. Any cross-tenant, unverified or replayed invitation is rejected.
- The managed Neon organization plugin also exists but is **not** used as authority for REACH workspace RBAC, which stays application-owned.

## Test evidence and remaining gates
- Generated Ed25519 JWT and signed-cookie tests, expired/tampered/invalid assertion tests, role escalation and cross-tenant denial, invitation-token issue/replay and recipient mismatch test, and Next.js TypeScript/build/owner HTTP login gate execute in CI.
- Independent **staging Postgres authorization tests** confirmed: `reach_customer_runtime` cannot SELECT Meta token tables, `reach_invite_runtime` cannot SELECT Meta tables, staging view filters unverified fixture identities, and invitation workspace list contains only Synthetic Alpha/Beta.
- Browser-based signup, receipt of a real OTP email, sign-in, return from login to invite and live invitation acceptance **still require test mailboxes**: the two `example.com` fixture accounts cannot receive OTP. Do not mark this end-to-end flow verified.
- Production release blocked until: E2E test with two controlled verified email accounts; approved invitation/OTP email delivery; CORS/cookie and customer session revocation review; complete per-feature tenant RLS; reviewed Next.js 16 upgrade; secure owner onboarding and customer account provisioning; fresh PR review.
- No Instagram Unified Login, social publishing, provider messaging, customer payments, API-key automation, webhook subscription or other provider actions are activated.

## Official references
- https://neon.com/docs/auth/guides/plugins/jwt
- https://github.com/neondatabase/neon-js/blob/main/packages/auth/NEXT-JS.md
- https://neon.com/docs/auth/guides/email-verification
