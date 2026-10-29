# Agency Control — Milestone 1

This feature adds an agency-facing workspace to the existing `ghl-gpt-gateway` Next.js deployment. It does **not** replace existing HighLevel SDK/OAuth/MCP/agency action APIs.

## New routes

- `/`: visually separated sample client workspaces, feature catalog, GHL discovery and platform status.
- `GET /api/portal/session`: returns administrator configuration and current cookie session status.
- `POST /api/portal/session`: separate portal administrator login.
- `DELETE /api/portal/session`: logout.
- `POST /api/portal/scan`: authenticated, **read-only** subaccount and module-count discovery through the **single main GHL agency** connection, capped at eight subaccounts. Does not import records or perform writes.

## Main-account-only HighLevel integration

Only the agency owner connects the primary HighLevel agency account. `GHL_COMPANY_ID` must identify the main agency before scans are enabled. Agency discovery uses the existing agency-level integration. GHL APIs for individual subaccount features can require location-scoped OAuth tokens, which the existing gateway derives *server-side* from the agency installation; the client never signs in, consents separately or supplies GHL credentials. If a subaccount is not covered by the agency authorization/scopes, its feature inventory remains unavailable rather than prompting that customer to connect.

This **does not** connect separate external GHL agencies or accounts that are not under the authorized agency. The client-facing product workspaces and feature packages are distinct from GHL authorization.

## Set administrator access through Vercel environment secrets

- `AGENCY_PORTAL_PASSWORD_SHA256`: hex SHA-256 of a random, **16+ character** administrator password.
- `AGENCY_PORTAL_SESSION_SECRET`: separate high-entropy secret, minimum 32 characters.

No environment secret should be entered in code or in this file. The signed session cookie is HttpOnly, SameSite=Strict and expires after eight hours. This is an initial single-admin access model, **not** production multi-client authentication. Use deployment protection and durable rate limiting/WAF before opening the login endpoint widely.

## Protected boundaries

- Existing GHL credentials and permissions are untouched.
- Existing CRM and social write routes are unaffected and retain their prior independent authorization checks.
- Scanner returns **only** location names/IDs and module inventory counts; no raw contacts, private tokens, posts or student data.
- Three sample clients are synthetic and are **never** mapped automatically to live GHL accounts.
- Feature requests in the UI are previews only. They do not create entitlements, change GHL permissions, provision apps, charge clients or persist to a database.
- `entitled` and `canApprove` encode the planned backend policy; real server-side tenant grants, OIDC customer logins, Stripe test billing and Frappe/Postiz adapters are follow-on milestones.

## Future control database model (design only)

- `tenants`(id, name, ghl_location_id, status)
- `users`(id, subject, email); `memberships`(tenant_id, user_id, role)
- `domains`(tenant_id, hostname, verification_status)
- `service_instances`(tenant_id, provider, external_id)
- `feature_grants`(tenant_id, module_key, approved, provisioned, billing_state)
- `subscriptions`(tenant_id, stripe_customer_id, stripe_subscription_id, status)
- `usage_events`(tenant_id, module_key, quantity)
- `audit_events`(tenant_id, actor, action, timestamp)

## Acceptance checks

Run `node --experimental-strip-types --test tests/agency-contracts.test.mjs` under Node 22+. Verify responsive UI and existing gateway endpoints on a Vercel **preview** before production promotion. No DNS or customer data migration is part of this milestone.
