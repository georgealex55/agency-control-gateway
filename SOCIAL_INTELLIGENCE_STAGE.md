# Social Intelligence — isolated staging milestone

## User constraints

- Work in the original `agency-control-gateway` Next.js structure, with the pinned upstream `services/sources/postiz` submodule maintained unchanged.
- No production merge/deploy, GHL scan/import, customer data, live publishing, SMS/email, client domain or billing writes.
- Functional **draft authoring, draft editing/deletion, content planning and calendar** on a staging-only PostgreSQL branch.
- Read-only integration to a distinct Postiz staging organization (when provisioned).

## Current staging resources

- Source branch: `feature/social-intelligence-stage-20261029`
- Neon project: `red-tree-98955858`, branch `br-ancient-butterfly-b557pl3a`, database `agency_platform`
- Synthetic workspace: `Social Intelligence QA`, UUID `8bba25e1-dc8e-4601-8bf2-91092f097bcc`
- Vercel preview branch has a **branch-only** `AGENCY_PLATFORM_DATABASE_URL` and `SOCIAL_STAGING_ENABLED=true`.
- Preview server rejects social API calls unless `VERCEL_ENV=preview`, the exact staging git branch, and opt-in flag are present.

## Routes

| Path | Methods | Effect |
| --- | --- | --- |
| `/api/platform/social?workspaceId=...` | GET | List **only** that workspace's draft/planned/approved items; agency session required |
| `/api/platform/social` | POST | Save plain-text draft or internally planned content |
| `/api/platform/social/:id` | PUT | Edit an item **only when workspace_id matches** |
| `/api/platform/social/:id?workspaceId=...` | DELETE | Remove **only** the item in the selected workspace |
| `/api/platform/social/postiz?workspaceId=...` | GET | Verify a separate Postiz organization, then list its connected channels; optional read-only per-channel analytics |
| `/api/platform/workspaces` | GET | Existing agency workspace list |

Every route requires authenticated agency admin; mutating routes enforce same-origin. SQL parameters are bound and workspace IDs checked. A social item is not a Postiz scheduled job: there are no server-side Postiz POST/PUT/DELETE calls, no outbound social sends, and no scheduled queue tasks.

## Existing pinned Postiz APIs

The source in `gitroomhq/postiz-app@64f00fd6d0e9dfd55d202ff83983e7576e08bc2e` includes the public v1 endpoints:
- `GET /api/public/v1/me` to validate organization ID
- `GET /api/public/v1/integrations` to enumerate channels
- `GET /api/public/v1/analytics/:integration` for metrics when available

Source: `services/sources/postiz/apps/backend/src/public-api/routes/v1/public.integrations.controller.ts` (available after explicit recursive source checkout). Raw API keys never go to the browser.

The Postiz service **does not run on Vercel**. Staging needs separate persistent Postiz containers/DB/Redis/workers, plus social developer app credentials if channels are connected.

## Optional Postiz read-only configuration

Set directly in Vercel **only for the staging branch**, not globally:
- `SOCIAL_POSTIZ_BASE_URL`: publicly reachable HTTPS root of isolated Postiz staging service
- `SOCIAL_POSTIZ_API_KEY`: staging Postiz API key (sensitive; not browser-visible)
- `SOCIAL_POSTIZ_ORG_ID`: Postiz staging organization ID returned by `/me`
- `SOCIAL_POSTIZ_WORKSPACE_ID`: UUID of the one staging workspace allowed to use that organization

No adapter support for a global production key or multi-client connection sharing is implemented. Production must use a secure per-tenant credential vault and Postiz organization isolation before any client access.

## Operator login

Existing agency admin secrets are not configured in Vercel yet. Configure `AGENCY_PORTAL_PASSWORD_SHA256` and `AGENCY_PORTAL_SESSION_SECRET` on the staging preview branch only using Vercel's secret UI before using the authenticated interface. Limit access to trusted staff; current password-based agency login is provisional. No public signups.

## Tests/limitations

- Validation and mocked-Postiz contract tests run in GitHub Actions; a mock is not a live social provider.
- Neon staging SQL smoke confirms draft CRUD and cross-workspace denial using only synthetic records.
- No real Postiz deployment or verified social API credentials are present yet. Do not describe the current integration as publishing-ready.
- No synthetic social reach/engagement metrics are shown as live analytics.
- Stage may be promoted **only after** identity, tenant isolation, rate-limiting, OAuth, API scopes and independent Postiz staging service are validated.


## 2026-10-29 Vercel-native update

Further development moved to `feature/social-vercel-native-stage-20261029` and `SOCIAL_VERCEL_NATIVE_STAGE.md`. The Postiz backend is no longer the hosting dependency. It is retained as a pinned research/reference checkout only.
