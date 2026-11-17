# REACH 2.3 Command Center — secure staging follow-up
Date: 2026-11-17
Branch: experiment/reach-23-ui-redesign-staging-20261115
Starting HEAD: aa6d1be0299a14333c467a410eb202927710c5c6
Code SHA for final behavioral change: e509038ceb1443d4c8b113308dc8e2efd0df743d

## Implemented and committed
1. Corrected saved layout SQL: prior INSERT SELECT required revision=0 even when updating an existing row, blocking second and later saves. Now the first save uses INSERT with ON CONFLICT DO NOTHING, while subsequent saves use an atomic UPDATE matching workspace_id and expected revision; audit insertion comes only from successful changed rows. Old/stale revisions return conflict (409). This is query code with synthetic contract tests, NOT yet executed on a live staging DB.
2. Server-side strict widget IDs, order, hidden/wide arrays and unknown-key rejection remain enforced. Saved layout JSON and revision are validated before returning to the UI. A malformed stored layout fails closed.
3. Owner Command Center now strictly validates workspace list, social insights, dry-run monitor and provider status responses. Wrong-workspace responses, invented external analytics and unsupported provider state/count combinations are rejected. Backend monitor returns the workspaceId to enable this check.
4. Authentication expiry clears the owner session. Workspace loading errors have Retry and Owner Setup actions. Data errors distinguish owner sign-in, unavailable staging service, missing configuration, wrong workspace and retry. A data refresh does not reset unsaved widget layout edits; saved layout reload is separate and manual, including after a 409 conflict.
5. Added synthetic runtime tests exercising actual transpiled TypeScript validators and SQL contract statements, mock HTTP 200/401/network/invalid responses and owner layout schema. Expanded native static security contracts and added a full Next.js typecheck/build in CI.

## Critical isolation guard
A Vercel metadata-only audit found AGENCY_PLATFORM_DATABASE_URL targeted to production, preview and development in the connected agency-control-gateway project. No variables are scoped specifically to experiment/reach-23-ui-redesign-staging-20261115. This global URL CANNOT be assumed to be an isolated staging database.

Therefore every NEW Command Center database touch is gated:
- Authenticated owner session,
- VERCEL_ENV=preview,
- exact VERCEL_GIT_COMMIT_REF matching this successor branch,
- REACH_COMMAND_ISOLATED_STORAGE_ENABLED=true,
- REACH_COMMAND_APPROVED_DATABASE_SHA256 (SHA-256 of the exact trimmed AGENCY_PLATFORM_DATABASE_URL; branch-scoped sensitive),
- existing AGENCY_PLATFORM_DATABASE_URL must match that approved hash in timing-safe comparison.

The GET /api/platform/command-center/readiness endpoint checks this without querying the database or returning connection details. The UI calls it BEFORE requesting any workspace or social metric. Both dashboard layout GET and PUT fail with HTTP 428 before touching Neon when not approved. Layout writes require the additional exact-branch REACH_COMMAND_LAYOUT_WRITES_ENABLED=true. Nothing was configured in Vercel during this pass. Production and live records were not read, touched or modified.

Neon read-only inventory: agency-control-gateway project red-tree-98955858 has default branch production and older social stage branches; the listed stage branches (including agency-five-seats-stage-20261029) are archived. These must not be presumed empty or available. No project, branch, compute, credentials, schema, database or paid resource was created/modified.

## Tests and deployment evidence
- GitHub Actions prior complete run 44197912741 (code SHA 3d17cbbb75d4ee4ed01d3ca8a1c644eeef829be4): contracts 24 passed, 0 failed; actual transpiled TypeScript runtime tests 9 passed, 0 failed; TypeScript typecheck and Next.js build passed.
- Most recent run for code SHA e509038ceb1443d4c8b113308dc8e2efd0df743d: https://github.com/georgealex55/agency-control-gateway/actions/runs/44198117423 . Inspect final completion state separately; don't infer status from previous runs.
- Vercel build dpl_8ngnvFUwsZiPHae54JUzWiemaq6e READY at e509038c; preview https://agency-control-gateway-8wqqe4i7x-georgealex1925-2750s-projects.vercel.app . READY does not establish authenticated browser usability.
- Existing offline REACH source and public demo mirror unchanged; source equality checked in staging CI.
- No real OAuth, external publishing, SMS, emails, live schedules, payment, access to customer records or production/main Git changes.

## Approvals and acceptance still required
1. Explicit owner approval of one isolated non-production Neon project/branch/database (and provisioning/unarchiving if required). Verify the data boundary and whether resource work incurs cost. Do not reuse production or Fieldclock customer storage by inference.
2. After that approval, configure branch-only private admin credentials and isolated AGENCY_PLATFORM_DATABASE_URL override in Vercel. Configure the fingerprint and isolated storage flag only after verified target check. Enable SOCIAL_STAGING_ENABLED for the branch only after confirming social schema, and leave social provider OAuth and publishing disabled.
3. To exercise actual saved layouts, approve REACH_COMMAND_LAYOUT_WRITES_ENABLED=true only on this preview. Run synthetic workspace/database acceptance: first save, reload, second save, stale-revision 409, wrong-workspace 404, invalid payload 400, unauthenticated 401, cross-origin 403, audit receipt and no cross-tenant writes. Remove synthetic records after inspection.
4. Authenticate to the protected preview and test desktop/mobile, load/reload, session expiry, keyboard focus and screen-reader error announcements. No such browser session or real PostgreSQL transaction was run during this pass.

This follow-up is staging code completion and mock validation, not authorization to activate live resources.
