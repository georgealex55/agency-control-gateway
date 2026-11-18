# REACH 2.3 — Production owner login and social Connections release

Release prepared on 2026-11-17 (UTC transition to November 18).
Repository: georgealex55/agency-control-gateway
Source release branch: release/reach23-owner-login-connections-20261117
Main before promotion: a745db200febb8cf752dad0dea9502d69451c7de
Verified code SHA: 89e771451f58933b553bd7ef6e3836137145fd71

## Scope
This release promotes the current REACH 2.3 staging application history plus a production-safe owner sign-in surface and an owner-facing read-only social connection management page.

The staging history was 571 GitHub commits ahead of main and changed 287 paths before the additional release hardening. These commits include feature scaffolding, multiple isolated stage-only capabilities, audit docs and workflow files. Promotion is **code deployment** only and does not imply that all service integrations are configured, usable, or approved for real customer data.

## New owner routes
- `/login`: uses existing server-generated, signed HttpOnly SameSite=Strict admin cookie from `/api/portal/session`. Allows only exact return destinations `/` or `/connections`. If credentials are missing, it shows a setup-required state. No password is stored in browser storage.
- `/connections`: requires an authenticated owner; lists real provider setup needs without claiming connected accounts. Explicit business workspace selection and Facebook Pages / Instagram Professional read-only OAuth start, account selection, verified token lifecycle and disconnect controls when configured. LinkedIn, TikTok, YouTube and other networks remain setup-only.
- `/api/reach/connection-hub`: server-side provider/status catalog. Owner authenticated, no secrets or raw tokens; no production workspace queries until approved database credential.
- Meta account routes reuse existing signed OAuth state, one-time flow, canonical callback host, encrypted token handling, authorized account selection and revocation tracking. Existing Social Studio draft/calendar/publishing endpoints remain separately stage-gated.
- Platform workspace API in production rejects database queries without the explicit connection database approval.

## Production settings REQUIRED before activation (do not put secrets in GitHub or chat)
1. Owner login: `AGENCY_PORTAL_PASSWORD_SHA256` (SHA-256 hex of the owner-selected strong password), `AGENCY_PORTAL_SESSION_SECRET` (unpredictable secret >=32 characters), both private Production Vercel variables.
2. Approved isolated business database: `AGENCY_PLATFORM_DATABASE_URL` (private database credential). `REACH_CONNECTIONS_APPROVED_DATABASE_SHA256` is the SHA-256 hex digest of the exact trimmed database URL (private), which must correspond to an explicitly approved target; set `REACH_CONNECTIONS_PRODUCTION_ENABLED=true` only after proving isolation and verifying schema. The existing globally configured database URL MUST NOT be implicitly approved.
3. Meta authorization flag: `SOCIAL_META_CONNECTIONS_ENABLED=true` only when the Meta Developer app(s), approved scopes, registered exact callback URI, schema and owner consent are ready. Other provider integration flags and all publishing remain off.
4. Meta developer configuration (private except app ID/redirect): `SOCIAL_META_FACEBOOK_CLIENT_ID`, `SOCIAL_META_FACEBOOK_CLIENT_SECRET`, `SOCIAL_META_INSTAGRAM_CLIENT_ID`, `SOCIAL_META_INSTAGRAM_CLIENT_SECRET`, `SOCIAL_META_GRAPH_VERSION`, `SOCIAL_META_REDIRECT_URI`, `SOCIAL_META_OAUTH_STATE_SECRET`, `SOCIAL_META_TOKEN_KEY`.
   The callback must be registered with Meta as the exact canonical HTTPS `/api/platform/social/meta/callback` path on the chosen production domain, e.g. `https://agency-control-gateway.vercel.app/api/platform/social/meta/callback` if that domain is assigned.
   Facebook Pages read-only permissions `pages_show_list` and `pages_read_engagement`; Instagram professional login scope `instagram_business_basic`. App access/review, matching accounts and end-user OAuth consent are required. Do not infer that Facebook and Instagram scopes are interchangeable.
5. Validate the approved Neon schema for `agency_platform_workspaces`, `agency_social_meta_*`, `agency_platform_audit_events` before enabling real reads and consent. Apply migrations only with explicit database approval, using synthetic accounts first. Do not restore, reset, or copy customer data to activate this feature.

Reference documentation:
- Meta Instagram permission changelog: https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/
- Meta Graph Pages: https://developers.facebook.com/docs/graph-api/reference/user/accounts/
- Meta Instagram Login API collection: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login

## Security invariants
- Owner login is required for status, authorization, account selection, verify and disconnect.
- State + HttpOnly OAuth nonce + one-time workspace-scoped consent; fixed Meta hosts, canonical redirect, server-side token encryption; no browser-stored social access tokens.
- Account status only becomes read_only when returned by authorized encrypted provider inventory; no fake connected state.
- No external posting, comments, DMs, advertising, SMS, queue dispatch or live scheduling is enabled.
- Global GHL migration and customer imports are not activated.
- Development, stage, historical branch credentials are not copied into production automatically.

## Verification
- Release candidate SHA `89e771451f58933b553bd7ef6e3836137145fd71`: GitHub Actions `https://github.com/georgealex55/agency-control-gateway/actions/runs/44225298772` completed SUCCESS.
- Node 22: 41 automated assertions passed, 0 failed. TypeScript typecheck: success. Native Next.js build: success. Offline REACH/demo mirror: matched.
- Vercel preview `dpl_CBbmzgApubZRGxy6DNmL2z4dpNLs` was READY at the exact release code SHA. This is NOT a real OAuth or owner sign-in verification.
- No real social account has been connected in these checks; no production credential provisioning, database writes, or provider OAuth attempts were performed.

## Post-merge acceptance needed
- Verify main branch merge SHA and successful production Vercel deployment; open `/login` and `/connections` to confirm status displays without leaking secrets. 
- After explicit target and app approvals, configure production-only credentials directly in Vercel; complete owner sign-in, synthetic workspace creation, read-only OAuth, Page/Instagram professional selection, verify, disconnect, cross-tenant and replay tests before connecting real accounts.
