# Social Intelligence: Vercel-native staging

## Architecture decision

Keep the existing Next.js control plane on Vercel and the platform database on Neon. A separate Postiz/Railway service is **not required** for this implementation. The existing pinned Postiz source remains an attribution/reference checkout only, not runtime code. Never copy AGPL-licensed Postiz server internals into the proprietary Next.js app without appropriate license review.

\`\`\`text
Agency Control / Social Studio (Vercel preview)
  ├─ content drafts / internal approvals → Neon agency_social_posts
  ├─ POST /api/platform/social/dispatch (signed admin + same origin)
  │     └─ due approved entries → Neon agency_social_dispatch_jobs (unique per post/revision/channel)
  │                           └─ @vercel/queue.send agency-social-dry-run-v1 (job IDs only)
  └─ private Vercel Queues consumer
        └─ validates stage branch + workspace, revision, approval and due date
             └─ atomic status=simulated/canceled + Neon audit entry
                  └─ NO social-network API calls
\`\`\`

## Deployment scope

- Source branch: \`feature/social-vercel-native-stage-20261029\`.
- Database branch: \`br-solitary-leaf-b54n1twm\`, forked from the earlier synthetic stage. Production database is **not modified**.
- Vercel env variables \`AGENCY_PLATFORM_DATABASE_URL\` and \`SOCIAL_STAGING_ENABLED=true\` exist only for this preview branch.
- The existing admin login still requires separately configured \`AGENCY_PORTAL_PASSWORD_SHA256\` and \`AGENCY_PORTAL_SESSION_SECRET\`. No bypass login is provided.
- \`ghl-gpt-gateway/vercel.json\` includes a private Vercel Queue consumer using \`experimentalTriggers\`; this is a staging-only code branch, not a production rollout.
- There is **no Vercel Cron job** yet. Official Vercel Cron triggers only run on production, so this branch exposes an admin-triggered due-post check instead. Future production service can add a verified schedule after separate release approval.

## Safe API

- \`GET /api/platform/social?workspaceId=<uuid>\` — workspace posts.
- \`POST /api/platform/social\` — create staged drafts.
- \`PUT/DELETE /api/platform/social/:id\` — edit/delete only within matching workspace.
- \`GET /api/platform/social/jobs?workspaceId=<uuid>\` — private simulated outbox and delivery status.
- \`POST /api/platform/social/dispatch\` — review due approved items and submit **dry-run** queue messages.
- \`app/api/queues/social-dry-run/route.ts\` — private queue callback, no social networking API code.
- \`GET /api/platform/social/postiz\` — retired (410) for this branch.
- GHL scanning endpoint refuses requests in this stage.

This queue has at-least-once delivery, so the consumer updates the record only if it is pending/queued; retries are no-ops. It also verifies the current post revision, approval state, due time, tenant ID, and target channel before simulation. A revoked or edited post becomes canceled rather than delivered. No queue payload contains captions, images or provider credentials.

## Database schema

New \`agency_social_dispatch_jobs\` table in the isolated Neon staging branch, with foreign keys to the workspace and post, unique \`(post_id, channel, post_revision)\`, and \`pending | queued | simulated | canceled\` states. Existing \`agency_social_posts\` supplies scheduled date, approval, text, and channel intents. The separate platform audit table records changes.

## Verified staging SQL smoke

The synthetic post \`11111111-1111-4111-8111-111111111111\` produced two unique jobs for Instagram and Facebook. The first dry-run simulation became \`simulated\`. After revoking the post and updating its revision, the second became \`canceled\`. Both audit events were recorded and no provider was contacted. This is a **database dispatch-policy test**, not yet a confirmation that the Vercel Queue callback executed over the network.

## Before any real publishing

1. Replace the provisional single-admin password system with customer OIDC and workspace-scoped API authorization.
2. Add tenant-specific social OAuth token vault and callback security; never share Postiz tokens or organization keys.
3. Add Facebook/Instagram/LinkedIn/etc provider adapters with provider-specific rights/permissions, media support and tests.
4. Add explicit queue enablement and provider-access entitlements (not just the \`planned\` module state), retries, rate limits, monitoring and dead-letter reconciliation.
5. Verify end-to-end private queue callback on a protected preview, including duplicate deliveries, credential expiry, and restart.
6. Add Vercel Cron in an approved future **production** release after a staging validation plan.
7. Validate terms/limits and actual analytics metrics. Do not report synthetic reach or engagement.

**No customer content published, GHL import run, billing activated or production branch merged by this milestone.**

## Staging reliability and intelligence update — October 29, 2026

The dispatcher now uses a PostgreSQL lease rather than selecting pending jobs without claiming them. FOR UPDATE SKIP LOCKED atomically leases up to 25 due records per request with a two-minute claim. Each claim increments an attempt count. A failed Vercel send records QUEUE_SEND_FAILED, schedules a delayed retry, and releases the lease. At five failed claims, automatic retry stops and the delivery ledger flags exhausted attempts. The receiving worker remains simulation-only.

The isolated staging table agency_social_dispatch_jobs gained additive fields: claim_until, next_attempt_at, attempts and last_error_code. The production database was untouched.

A concurrent SQL smoke test with one synthetic approved LinkedIn target produced one lease in the first request and zero in a competing request. A simulated send failure recorded one attempt and a future retry deadline. The earlier approval-revocation smoke test recorded one simulated and one canceled delivery, both audited.

The Social Studio now includes Internal Insights from actual staging database records: drafts, approved content, next-seven-day schedules, overdue approvals, channel targets, simulated deliveries and exhausted retries. The endpoint deliberately returns externalReach=null, externalEngagement=null and metricsAvailable=false; it never fabricates provider analytics. Every data query is scoped to workspace ID.

A Social Connections tab lists the app-registration and OAuth requirements for Facebook Pages, Instagram Professional, LinkedIn, TikTok, YouTube, X, Threads and Pinterest. All accounts remain not_connected and all authorization and publishing actions are disabled. Instagram professional OAuth requires instagram_business_basic, while Facebook Pages use pages_show_list and pages_read_engagement for eventual read access. Do not conflate the two Meta login flows.

### Outstanding validation boundaries

- A passing Next.js build or mock test does NOT prove the real Vercel Queue callback was delivered over the network.
- Admin login is not configured for this preview. No bypass has been created.
- Provider API authentication, posting and external analytics have not been exercised.
- A stale queued job after message TTL expiry requires a future reconciliation policy; old queued records should be flagged for manual review.
- Do not activate client-facing connections, billing, publishing, GHL imports, or production Cron without separate authorization and security testing.
