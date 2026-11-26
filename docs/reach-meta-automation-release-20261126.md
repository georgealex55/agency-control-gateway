# REACH Social Studio: Meta automation release (Nov 26, 2026)

## What is implemented
- Owner-only Social Studio Automations panel: choose an existing Facebook Page or Instagram Professional account, save a draft, set a scheduled date/time, approve it, cancel it, and review a delivery receipt.
- Business-specific database entries with immutable idempotency keys, one-time atomic claims, row-level tenant isolation, delivery receipts, and manual reconciliation instead of automatic retry after ambiguous provider responses.
- A scheduled worker invoked every 15 minutes by Vercel Schedules, protected with CRON_SECRET. Each run checks the current flags and approved due actions. Schedules on Hobby use up to 15 minutes of jitter.
- Facebook Page feed text publishing with a selected Page token, Instagram photo publishing using a public HTTPS media URL and Meta's media-container flow, and manual comment/DM replies to webhook-verified incoming interactions. App and account scopes are checked against Meta immediately before sending.
- Meta webhook challenge and HMAC-SHA256 signature verification; matching connected account events are stored without raw message bodies. Sender and comment IDs are retained for at most 30 days. No webhook event automatically sends a reply.
- A local no-send due-work simulator in Social Studio. The original stage-only Vercel Queue dry run has NOT been switched to production.

## Security and rollout
- PRODUCTION KILL SWITCHES: SOCIAL_META_LIVE_DELIVERY_ENABLED and SOCIAL_META_AUTO_POST_ENABLED default to false. SOCIAL_META_WEBHOOKS_ENABLED defaults to false. No posts or messages will send by installing the release.
- Production CRON_SECRET and SOCIAL_META_WEBHOOK_VERIFY_TOKEN must be privately configured in Vercel; Meta app owners must then subscribe callback https://agency-control-gateway.vercel.app/api/platform/social/meta/webhook. This configuration is not automatically performed just by connecting an account.
- Publishing for Facebook requires pages_manage_posts and a selected Page token with CREATE_CONTENT or MANAGE task. Instagram Direct requires instagram_business_content_publish; Instagram Unified login requires instagram_content_publish. Meta app review may be needed for customer assets.
- Messaging requires explicit approved content, a verified incoming Meta message from the selected account, and a response within 24 hours. No unsolicited or marketing messages.
- Comments require matching verified inbound comment events on the account. Signed events are not automatically answered.
- Approval and dispatch roles are currently the existing single platform owner; Phase 2 tenant auth remains a separate draft and is not merged.
- No provider tokens or raw webhook message contents are returned to the browser, query logs or response bodies. All provider calls are fixed-host HTTPS with redirected requests refused.
- Existing connections @litsnaplive, Xander Tech and RawR have no stored recorded scopes. UI must say unknown or missing until authenticated live Meta check succeeds.

## Test and activation plan
1. Run unit/policy tests and Next production build. Apply migration first on isolated staging, verify RLS and cross-account isolation, then apply to production as an approved non-destructive migration.
2. Deploy feature with live writes and scheduled dispatch disabled. Confirm Social Studio displays all three accounts, and the simulation returns no external send.
3. Under the user's authenticated owner session, check permissions and load real analytics on all three accounts. These checks require the user's browser session; synthetic tests cannot establish live Meta grants.
4. Configure Meta Webhooks subscription and review signed incoming test events. Validate replies with controlled counterpart accounts.
5. Enable single-action live delivery only after approval of an explicit real test post. Confirm external receipt and account post in Meta before enabling SOCiAL_META_AUTO_POST_ENABLED.
6. Do not enable broad auto-replies or unattended marketing messaging. Add separate reviewed rules and an opt-in per organization.

Sources: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ ; https://developers.facebook.com/docs/graph-api/reference/page/feed/ ; https://developers.facebook.com/docs/instagram/platform/instagram-api/changelog/ ; https://vercel.com/docs/schedules/configuration
