# Agency Control — Read-only Facebook Pages & Instagram Professional connections

## Current boundary

- One administrator, no additional user accounts.
- Vercel + isolated Neon staging branch only; production unchanged.
- Media uploads deferred at user's request. No additional Blob work in this milestone.
- **No live Meta accounts have been connected**. OAuth remains explicitly disabled with branch-scoped `SOCIAL_META_CONNECTIONS_ENABLED=false`. No Meta developer app IDs or secrets are configured.
- Absolutely no Facebook Page posting, Instagram publishing, DMs, comment management or OAuth publish scopes.
- GHL scanning/import and other social-channel OAuth are deferred.

## What is implemented

### Facebook Pages (Facebook Login for Business)
- OAuth authorize URL: `https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth`.
- Only two read-oriented scopes are requested: `pages_show_list` and `pages_read_engagement`.
- Exchange code server-side via `graph.facebook.com` token endpoint.
- Fetch at most 25 managed Pages using a strict GET-only endpoint with no caller-controlled URL or redirect.
- Present eligible Page IDs/names for **explicit administrator selection**. Not all accessible Pages are connected automatically.
- Store an encrypted user access token bound to the selected Page and workspace (read-only account discovery). Later Page-specific operations will need a separate access/scope review.

### Instagram Professional (Instagram Login)
- OAuth authorize URL: `https://www.instagram.com/oauth/authorize`.
- Only `instagram_business_basic` requested; distinct from the older Facebook-linked Instagram permission family.
- Exchange code server-side with `api.instagram.com/oauth/access_token`.
- Fetch and validate Professional identity via fixed-host `graph.instagram.com` read request.
- Present profile for explicit administrator selection.

### Shared consent and token safety
- Begin from authenticated, same-origin administrator POST in Social Connections.
- Enforce `SOCIAL_META_CONNECTIONS_ENABLED=true`, `SOCIAL_STAGING_ENABLED=true` and the exact allowlisted staging branch.
- Exact HTTPS OAuth redirect host must equal the active preview origin.
- HMAC-signed OAuth state expires within 10 minutes and is bound to provider, workspace and random nonce.
- An HttpOnly, Secure, SameSite=Lax temporary cookie binds the returning browser. This separate temporary cookie is necessary because the original admin login cookie uses SameSite=Strict and will not accompany a cross-site Meta redirect.
- Neon stores the hashed nonce and consumes consent once (idempotent replay rejection). Invalid/cancelled callbacks cannot link an account.
- Discovered accounts and access token are staged in a short-lived (10-minute) pending record. No tokens are returned to the browser.
- Choosing one account encrypts the bearer token using AES-256-GCM bound to workspace, provider and account ID; the pending consent is atomically consumed.
- The connection listing API shows only account metadata and token expiry, never OAuth credentials, encrypted envelopes or callback secrets.
- Disconnect deletes the stored local authorization and audits the action. It does not automatically revoke the Meta-side grant; the administrator can revoke app access in Meta.
- No token refresh, post creation or publishing is implemented yet. Expired tokens should be reauthorized.

## Required Vercel environment (staging only)

1. `SOCIAL_META_FACEBOOK_CLIENT_ID`: numeric Meta app ID for Facebook Login for Business.
2. `SOCIAL_META_FACEBOOK_CLIENT_SECRET`: the matching app secret, Sensitive.
3. `SOCIAL_META_INSTAGRAM_CLIENT_ID`: numeric Instagram app ID.
4. `SOCIAL_META_INSTAGRAM_CLIENT_SECRET`: the matching Instagram app secret, Sensitive.
5. `SOCIAL_META_GRAPH_VERSION`: a Meta Graph API version supported by the connected app, e.g. `v25.0` if supported at activation time; verify with the app dashboard rather than assuming an arbitrary future version.
6. `SOCIAL_META_OAUTH_STATE_SECRET`: a separate cryptographically strong random secret (minimum 32 characters), Sensitive.
7. `SOCIAL_META_TOKEN_KEY`: random 32-byte AES key encoded as unpadded base64url (43 characters), Sensitive.
8. `SOCIAL_META_REDIRECT_URI`: exact HTTPS callback URL on the **active fixed staging origin**, `https://<staging-host>/api/platform/social/meta/callback`.
9. After verifying exact redirect, approved Meta app/tester roles and all secrets, set `SOCIAL_META_CONNECTIONS_ENABLED=true` **on this staging branch only**.

**Critical:** Vercel changes the unique preview URL after each commit. For OAuth, use an explicitly configured stable staging hostname/project that supports exact redirect URIs. Do not use production domains or enable the feature across the live project.

Never paste app secrets or token keys into the repository, a document, GitHub comment or this chat. Set them in sensitive Vercel environment variables with correct staging scope.

## Initial live verification checklist

1. Visit Social Intelligence → Social Connections using the staging administrator login.
2. Confirm the appropriate provider shows *Configured* and *Authorize and select account*.
3. Start Facebook OAuth, approve only requested read permissions, return through the same staging hostname and see Page candidates.
4. Select exactly one test Page and verify it is shown in Connected accounts. Confirm no other Pages were connected.
5. Disconnect locally, confirm the record is removed, then remove Meta-side app authorization if appropriate.
6. Repeat with one Instagram Professional Business or Creator test account.
7. Test cancellation, expired state, incorrect nonce, replayed callback, wrong staging hostname, account from another workspace, expired token, and disabled `SOCIAL_META_CONNECTIONS_ENABLED`.
8. Inspect staging Neon audit records only; no Facebook/Instagram post, media or message operations should occur.

## Verification completed without credentials

- GitHub contract/build checks cover the new routes, authorization URL shapes, encrypted pending and final tokens, and no-provider-publishing invariants.
- Synthetic Neon smoke test consumed an OAuth flow once, rejected a duplicate consumption, and deleted the test row.
- The staging database still has **zero actual connected Meta accounts**.
- Provider OAuth endpoints were **not** called with real credentials; live end-to-end testing remains pending.

Meta documentation references:
- https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api
- https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/

## Durable token lifecycle and current infrastructure (additional staged work)

- Facebook and Instagram short-lived authorization code tokens are exchanged on the server for extended-life tokens before the application stages any account for selection.
- The Instagram `graph.instagram.com/access_token` exchange uses `ig_exchange_token`; the Facebook `graph.facebook.com/{version}/oauth/access_token` exchange uses `fb_exchange_token`. Both run on pinned trusted HTTPS hosts, refuse redirects and have request timeouts.
- The parser tolerates Meta's single-element wrapped Instagram token response and **rejects ambiguous token arrays**. Both long-lived exchanges fail closed if the provider does not supply an expiration or the returned lifetime is under 24 hours.
- Saved connections include expiry and last-read-verification timestamps. The administrator can press **Verify read access** to confirm the connected account is still reachable. Verification only performs read-only provider requests.
- Expired pending consent tokens are pruned on account-inventory reads, and obsolete one-time OAuth flow records are pruned on new consent requests.
- Two independent cryptographically generated Vercel sensitive variables have been configured **only on the single-admin staging branch**: `SOCIAL_META_OAUTH_STATE_SECRET` (HMAC signing) and `SOCIAL_META_TOKEN_KEY` (AES-256-GCM encryption). Neither secret was committed to Git nor emitted in the response.
- Developer app IDs and secrets, `SOCIAL_META_GRAPH_VERSION`, and exact stable `SOCIAL_META_REDIRECT_URI` are **still missing**. The branch-only `SOCIAL_META_CONNECTIONS_ENABLED=false` flag has not been enabled.
- A synthetic Neon SQL test confirmed that a pending account can be selected exactly once; a second consumption found no candidate, and all synthetic changes were rolled back. No real credentials or connected accounts were used.
- The GitHub `tests/social-meta-token-lifecycle.test.mjs` suite validates fixed hosts, long-lived token parsing, expiry requirements and fail-closed behavior.

**Important:** The OAuth connections here do not have refresh scheduling yet. Reauthorization is required if a token expires or is revoked. They also do not grant publishing, messaging, or post creation.
