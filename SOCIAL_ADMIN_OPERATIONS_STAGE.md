# Agency Control — Single-Admin Social Intelligence Operations (October 29, 2026)

This is the latest staged implementation. It supersedes the older five-seat plan. The app supports **one administrator**, multiple internal workspaces (not user accounts), and no client sign-ins. All GHL scanning/import, external social sends, billing and production release remain disabled.

## Shipped in staging

### Month calendar (local-time browser interface)
- Select months, click a day, filter planned entries by state, edit content or copy an item as a fresh unscheduled draft.
- `GET /api/platform/social/calendar?workspaceId=UUID&start=UTC_ISO&end=UTC_ISO` is administrator-protected and accepts a **1–45 day window**, with a maximum of 500 results and an explicit `truncated` flag.
- Dates are derived from the browser's local month, then converted to UTC boundaries for the database. The calendar is an *internal plan*, not an external publishing schedule.
- SQL tested on synthetic QA posts in the isolated Neon stage branch.

### Delivery/automation monitoring
- `GET /api/platform/social/monitor?workspaceId=UUID` reports jobs queued beyond one hour, expired processing leases, exhausted retry attempts, retry delays, and jobs created before the post was edited or approval was revoked.
- Counts are calculated over the **entire** selected workspace ledger; the detailed list is capped at 200.
- The monitor is **read-only**. It does not resend, publish, call social APIs or silently discard queued jobs.
- Existing `POST /api/platform/social/dispatch` is still a staging-only, authenticated **manual dry-run** sender, not a production cron or real publishing engine.
- The real Vercel Queue HTTP callback has **not** been verified by an authenticated user-initiated preview request. Prior SQL simulations and mocked contract tests are not a substitute.

### Private media linking
- Staging migration `007_social_post_media.sql` adds composite workspace foreign keys on post/media associations, so even a raw database write cannot link different client workspaces.
- `GET/POST /api/platform/social/:postId/media` lists and adds safe metadata links; `DELETE /api/platform/social/:postId/media/:mediaId` unlinks without deleting the private original.
- The Media Library's post selector allows up to ten linked images per post. Every successful attachment change bumps `agency_social_posts.updated_at`, invalidating earlier simulated delivery revisions.
- Synthetic staging SQL test: same-workspace link succeeded, cross-workspace link was rejected, and link/unlink created audit records and updated the post revision.
- Synthetic media records were cleaned up; no Blob images were uploaded.

### Meta readiness
- Separate fixed-host, GET-only adapters are present for Facebook Pages and Instagram Professional profile reads. Their tests use synthetic bearer tokens and mocked responses.
- Instagram API with Instagram Login requires `instagram_business_basic`; Facebook Page permissions are distinct. No real Meta account, OAuth token, callback exchange or permission grant is active.
- The real Meta OAuth callback remains intentionally disabled; no publishing adapter is enabled.

## Private Blob infrastructure blocker

The isolated private store `agency-social-staging-private` (`store_gzljSQEomfAWWROP`) has been created under the existing Vercel team but **is not connected to any project**. Uploads remain off (`SOCIAL_MEDIA_UPLOADS_ENABLED=false`), and staging requires an exact `BLOB_STORE_ID` match before accepting credentials. The available Vercel connector does not expose a Blob store-to-project linking action.

An administrator can connect the store through its Vercel Storage > Projects settings after verifying environment scope. **Do not enable this store globally on the live production project.** If environment scoping cannot be restricted sufficiently, use a separate staging Vercel project before connecting the private store. Prefer Vercel's short-lived OIDC Blob authentication once properly connected.

## Staging resources and release controls

- Git branch: `feature/agency-five-seats-stage-20261029` (draft PR #15; **not merged**).
- Neon project: `red-tree-98955858`, separate branch `br-polished-river-b59f8vaw`, database `agency_platform`.
- Single admin password/session secrets are branch-scoped Vercel sensitive variables; no client or delegated user login is available.
- Tests run in `.github/workflows/social-staging.yml`; Next.js preview builds automatically for this branch.
- Production branch, production Vercel deployment and production Neon schema remain untouched.
- Staging GitHub workflows do not carry Meta or Blob credentials.

## Go-live blockers (not claimed complete)

1. Controlled private Blob connection and a real authenticated private image upload/download test.
2. An authenticated, monitored real Vercel Queue callback dry-run on preview, with duplicate/no-op and retry verification.
3. Meta developer app registration and secure read-only OAuth consent testing. No publish scopes until separately approved.
4. Strong staging password rotation and API login protection; shared password is not unique-person verification.
5. Reconcile stale queued jobs before adding a production cron or external provider posting.
6. Separate owner approval, audited release candidate and production gate.


## October 29 infrastructure validation milestone — queue + private Blob

### Completed in staging

- Added staging-only table `agency_social_queue_probes` (migration `008_social_queue_probes.sql`), with a unique workspace/minute key to limit repeated test calls.
- Added an isolated Vercel Queue topic `agency-social-queue-probe-v1`, private callback `app/api/queues/social-queue-probe/route.ts`, and administrator-only diagnostic GET/POST endpoint `/api/platform/social/diagnostics/queue`.
- The probe contains only a UUID and workspace ID, never a caption, asset, provider token, customer name, or social publishing instruction.
- A sent message is **not** labeled delivered: the dashboard shows `acknowledged` only after the private Vercel consumer writes the acknowledgement to Neon.
- Database-only smoke test passed: an acknowledgement was recorded once; a duplicate callback was a no-op; the synthetic probe row was deleted. **Actual Vercel Queue invocation has not yet been tested by clicking the staging dashboard**.
- Added administrator-only `GET /api/platform/social/media/diagnostics` that performs an actual private Blob list read *only when staging credentials are configured*. It distinguishes environment presence from a verified storage connection.
- Added administrator-only `POST /api/platform/social/media/diagnostics`: synthetic 1-pixel PNG private upload, authenticated read-back and byte comparison, and deletion in a `finally` block. All results are returned without Blob URLs or secrets.
- The synthetic round trip is **disabled** unless `SOCIAL_MEDIA_UPLOADS_ENABLED=true`, `BLOB_STORE_ID` matches `SOCIAL_MEDIA_STAGING_STORE_ID`, and appropriate project-scoped OIDC or Blob token is available.
- The Social Studio Delivery Operations tab now has **Run queue self-test** and **Refresh result**. The Media Library has **Verify private Blob access** and **Test private upload/read/delete**.
- GitHub Node contract tests and Next.js preview builds check these controls on each push. All real social publishing and GHL operations remain disabled.

### External steps remaining

1. **Blob store connection:** Vercel Storage -> `agency-social-staging-private` -> Projects -> connect **only the intended staging environment** of Agency Control, using OIDC, not the production environment. If preview-only isolation is impossible in the original project, use a dedicated protected staging project; do not attach the private Blob store globally. The connected store ID must equal `store_gzljSQEomfAWWROP`.
2. Verify a deployed preview actually receives `BLOB_STORE_ID` and OIDC (or explicitly scoped Blob) credentials. Run **Verify private Blob access**.
3. Only after read access is verified, set `SOCIAL_MEDIA_UPLOADS_ENABLED=true` on the isolated staging branch, redeploy and run **Test private upload/read/delete**. Check the Vercel store shows no remaining synthetic Blob.
4. Log in using the existing single staging administrator and run **Run queue self-test** under Social Intelligence -> Delivery Operations. Refresh the result until `acknowledged` appears. If only `sent` appears, inspect Vercel Queue consumer delivery and runtime logs; don't claim the test passed.
5. Rotate the previously displayed staging administrator password before connecting real Meta accounts.
6. Only after both real infrastructure tests pass, test one ordinary private image upload and attach it to a planned post. Real social publishing remains disabled.

### Release boundaries

Current working Git branch: `feature/agency-five-seats-stage-20261029` (historical name; now single-admin). Draft PR #15 targets a preceding staging branch, not main. Neon branch `br-polished-river-b59f8vaw` is isolated. No Blob store is connected to the Agency Control project at this point; no real media was uploaded. Real Vercel Queue push delivery has **not** been confirmed yet. Production remains unchanged.
