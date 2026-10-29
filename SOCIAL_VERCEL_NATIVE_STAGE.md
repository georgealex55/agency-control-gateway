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
