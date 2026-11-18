# REACH personal staging: Neon Auth and isolated storage readiness — 2026-11-14

## Scope
User selected Neon Auth for a secure **personal** staging workspace and explicitly requested approval before provisioning resources or enabling external connections. This pass changes staging GitHub code only. No Neon branch, compute, Auth integration, account, OAuth grant, database object, environment variable or external service was created or modified.

## Infrastructure findings
- Neon project `agency-control-gateway` exists: `red-tree-98955858`, region aws-us-east-2, Postgres 18.
- On inspection, `list_branches` returned six branches, **all archived**, including the default `production` branch. Do not revive or use the default for testing; do not create a child branch from customer data without explicit consent.
- Existing Next.js admin portal uses a password-hash/HMAC session cookie (`lib/portal-auth.ts`). This is not Neon Auth. The public REACH shell demo login is also not secure owner authentication.
- Existing Meta staging OAuth has its own server-side consent/token safeguards. Do not activate it as part of Neon Auth setup.

## Prepared code, not activated
- `lib/connections/neon-owner-auth.ts`: verifies Neon Auth JWT with remote JWKS, explicit issuer/audience, exact owner subject, expiry and max one-hour lifetime. Requires `REACH_PERSONAL_CONNECTIONS_ENABLED=true` and an explicit Neon branch ID; fails closed on missing configuration. This is a verifier library, not a completed sign-in UI, session issuance or API authorization integration.
- `db/staging/20261114_personal_connections_registry.sql`: unexecuted schema migration with forced workspace row-level security and no credential columns. Application runtime must set workspace ID transaction-locally; role must not bypass RLS. Do not run until an isolated branch is approved and provisioned.
- Tests and CI enforce the basic contract. They are not substitutes for runtime authentication, cryptographic integration, migration tests or end-to-end isolation checks.

## Explicit approval required before next actions
1. Approve **creating a new empty isolated Neon project** (recommended to avoid cloning archived production data) or specify an existing **empty** isolated branch. Project provisioning may consume Neon plan resources. Do not restore the archived default production branch or clone customer data.
2. Confirm the personal owner email/identity to register in Neon Auth **through the provider's secure sign-in flow**, not by pasting a password into GitHub or chat.
3. Approve provisioning Neon Auth on the isolated branch and configuring its exact HTTPS staging callback/trusted origin. Authentication may require Neon plan eligibility and setup steps.
4. Approve applying the staged migration and binding server-side database credentials to **preview/staging only**, never production.
5. Only after verified login, owner identity, tenant-isolation tests and secure session management, approve connecting Google/Meta/AI/website/storage one at a time with minimum read scopes. Outbound sends and publishing remain disabled.

## Acceptance gates before enabling
- Neon Auth issuer/JWKS/audience match provisioned branch and exact expected owner subject; wrong branch, issuer, audience, expired or non-owner JWT rejected.
- Secure login/logout and session revocation, cookie/CSRF and replay protections, authorization on every protected endpoint.
- Database non-owner role with RLS enforced, no cross-workspace access, staging-only credentials, migration rollback.
- Full Next.js build, node tests, staging CI, browser and mobile checks, and a verified preview. Do not claim these complete before evidence.
