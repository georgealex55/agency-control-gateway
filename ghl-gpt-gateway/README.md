# GHL GPT Agency Control Gateway v2.3

A secure Vercel/Next.js control layer between GPT and HighLevel.

## Environment variables

- `GHL_PRIVATE_INTEGRATION_TOKEN` — full HighLevel Private Integration token
- `GATEWAY_API_KEY` — separate secret used by GPT to call this gateway
- `GHL_COMPANY_ID` — Agency/Company ID used for agency discovery and Agency → Location OAuth token generation
- `GHL_API_BASE` — defaults to `https://services.leadconnectorhq.com`
- `ALLOW_DESTRUCTIVE_ACTIONS` — defaults to false; set true only if you want deletes/removals enabled
- `GHL_OAUTH_CLIENT_ID` / `GHL_OAUTH_CLIENT_SECRET` — HighLevel Marketplace OAuth credentials
- `GHL_OAUTH_REDIRECT_URI` — Marketplace OAuth callback URL
- `GHL_OAUTH_DATABASE_URL` — Neon/Postgres connection string for durable OAuth sessions
- `GHL_TOKEN_ENCRYPTION_KEY` — 32-byte key used to encrypt OAuth token payloads before database storage

## Main endpoints

- `GET /api/health` — reports gateway configuration and official SDK integration status
- `GET /api/ghl/status` — protected live SDK diagnostic that performs a minimal HighLevel API request
- `GET /api/oauth/status` — reports OAuth + durable token-storage readiness without exposing tokens
- `POST /api/oauth/location-session` — protected diagnostic that mints/verifies a Location OAuth session without returning the token
- `GET /api/ghl/read-validation` — protected non-mutating SDK read matrix
- `POST /api/ghl/write-validation` — protected non-mutating invalid-payload preflight for SDK write scopes
- `GET /api/agency/identity` — protected diagnostic that validates the discovered Company ID against HighLevel
- `GET /api/openapi.json` — GPT Actions/OpenAPI schema
- `POST /api/agency/action` — semantic action router
- `POST /api/ghl/request` — advanced allowlisted proxy

All non-health calls require `x-gateway-key`.

## Native action coverage

### Social Planner
List connected accounts/posts, get a post, create/schedule/draft/publish posts, edit posts and optionally delete posts.

### Blogs
List blogs/posts, retrieve a published post body, create and update posts.

### Workflows
List workflow definitions. The gateway can also add/remove contacts from known workflows through the Contact API. HighLevel's public workflow endpoint is currently read-only for the workflow definition itself.

### Funnels / websites
List funnels and pages and manage redirects. Full visual website/funnel page editing is not exposed through the current public API; use browser automation for those UI-only changes.

### Existing CRM
Contacts, opportunities/pipelines and conversations/messages remain available through the advanced allowlisted proxy.

## Safety model

The HighLevel token is never returned to the client. Routes are explicitly allowlisted. Delete/remove actions are blocked unless `ALLOW_DESTRUCTIVE_ACTIONS=true` AND the request includes `confirmDestructive=true`.

See `PERMISSIONS.md` for the scope checklist.


## Official HighLevel SDK migration

The `ghl-sdk-integration` branch introduces `@gohighlevel/api-client` as the primary transport while preserving the legacy allowlisted REST layer as a fallback.

Agency-level discovery can continue to use the Agency Private Integration token. The Marketplace app is Sub-account targeted and bulk-installed by the Agency; its stored Company OAuth session mints per-location OAuth tokens, which are stored encrypted in Neon/Postgres and automatically refreshed by the SDK.

Currently migrated to the official SDK:

- Read: locations, Social Planner accounts/posts, blogs/blog post lists, workflows, funnels and funnel pages.
- Write: create/update Social Planner posts, create/update blog posts, add contacts to workflows and create redirects.
- Location-scoped read/write actions use durable Location OAuth sessions.
- Destructive actions remain on the legacy guarded transport until SDK validation is complete.

API responses from `POST /api/agency/action` now include `transport: "official-sdk"` or `transport: "legacy-rest"` so the active path is visible during testing.


## Validation status

Preview validation has confirmed official-SDK reads for locations, workflows, funnels, funnel pages, blogs and Social Planner accounts. The write-validation endpoint uses intentionally invalid payloads so OAuth/write-scope routing can be checked without creating live HighLevel data.
