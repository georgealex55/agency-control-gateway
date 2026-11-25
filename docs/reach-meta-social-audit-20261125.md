# REACH Meta Social integration audit — November 25, 2026

## Current production state (read-only check)
Saved owner-workspace links: Xander Tech (Facebook Page), RawR (Facebook Page) and @litsnaplive (Instagram Professional). All three connection records have empty granted_scopes arrays. This is a permission recording gap, not proof that Meta withheld every permission. Meta's Business Login configuration ID and Unified Login flag are present in production.

## Verified design constraints
- Permissions must be checked directly using Meta's debug_token endpoint, validating is_valid, app_id, expiry, scopes and granular_scopes target IDs. Unknown permissions are not granted permissions.
- Each capability displays four independent states: available, permission required, not activated, unverified. A working OAuth connection does not mean automation is enabled.
- Real analytics use Meta Graph GET requests for selected account information and recent post reactions/likes, comments and follower counts. Unknown metrics remain null. Never infer reach, impressions or follower growth from those counts.
- A Facebook Page token must be obtained server-side from the user's authorized /me/accounts listing. No Page tokens, app secrets or user tokens are sent to browsers or cached as analytics.
- Social posting, commenting, Messenger/Instagram inbox, scheduling and webhook actions remain disabled in this release. The existing due-post Vercel Queue simulator is available for safe testing.
- Expanded social permission requests require the person connecting an account to approve the requested Meta permissions, and may fail until Advanced Access and App Review are approved.
- For Instagram Unified Login, Meta's Business Login config_id controls the scope set. REACH cannot silently widen those scopes. A business admin must adjust the Meta configuration and reauthorize as required.
- Do not modify production Meta tokens, workspace database tables or user permissions through migration in this release.

## Test sequence after release
1. Go to the production REACH Connections page to confirm the three linked accounts.
2. In Social > Connections, click Check permissions separately for Facebook Xander Tech, Facebook RawR and Instagram @litsnaplive. If the Meta permission API rejects inspection, show unverified and reconnect after Meta app review.
3. In Social > Metrics, click Load real analytics for each. Match numeric follower/engagement data against Meta Business Suite for the same account. Metrics that are unavailable must appear as unavailable, not zero.
4. Use the existing due-post simulation to test scheduling/queue behavior without external publication.
5. Live automatic publishing is a separate activation gate requiring verified publish permission, idempotent delivery, approved test content and explicit user confirmation. No user-visible button should assert that live posting already works.

Official sources:
- https://developers.facebook.com/docs/graph-api/reference/debug_token
- https://developers.facebook.com/docs/insights/overview
- https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/
- https://developers.facebook.com/docs/graph-api/reference/page/feed/
