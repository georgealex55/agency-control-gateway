# REACH 2.3 — Command Center feature implementation
Date: 2026-11-17
Branch: experiment/reach-23-ui-redesign-staging-20261115
Starting HEAD: 68e5d6ace6272ad5d5af7b580282341a8af3bf19
Accepted code SHA: 54bb6f4693f60edf78c546395b32e00a1926b850

## Implemented
- Replaced placeholder Command Center with app/reach-command-center.tsx, preserving existing 26-feature navigation, authenticated workspace and Social Studio screens.
- Owner workspace selector reads GET /api/platform/workspaces. Real scoped internal stats come from GET /api/platform/social/insights, /monitor and /providers with selected workspace ID. Failed services show unavailable status, not invented zeros.
- Dashboard shows internal draft, approved, planned-next-seven-days and dry-run attention counts only. Never reports fabricated revenue, calls, external social reach or engagement.
- Seven widgets: readiness, social, provider statuses, delivery monitor, priority actions, quick actions and roadmap. Layout supports move, resize, hide, restore and reset.
- Functional shortcuts open existing Social Studio composer, calendar, provider readiness, workspaces and Neon connections. Contact creation and external messages remain disabled.
- Added a strictly validated layout contract, authenticated staging layout API and revision-safe conditional upsert with audit events. Layout saves apply only to an existing workspace; invalid widget/tenant input is rejected.
- Added exact new REACH staging branch to social stage allowlist while preserving preview-only and SOCIAL_STAGING_ENABLED flag gates.
- Offline REACH demo and public mirror unchanged.

## Saved layout activation gate
Server layout saving is OFF unless all are true:
- VERCEL_ENV=preview
- VERCEL_GIT_COMMIT_REF=experiment/reach-23-ui-redesign-staging-20261115
- REACH_COMMAND_LAYOUT_WRITES_ENABLED=true
- An approved isolated staging AGENCY_PLATFORM_DATABASE_URL with scoped DB privileges
- A real authenticated owner session and same-origin request

When disabled, dashboard customization is session-only and visibly labeled that way. No staging database schema was changed in this development pass. Do not enable writes before checking/approving the specific isolated DB target; do not assume historical branch secrets apply.

## Verification
- Native GitHub Actions CI: https://github.com/georgealex55/agency-control-gateway/actions/runs/44097499909 — SUCCESS at code SHA 54bb6f4693f60edf78c546395b32e00a1926b850.
- Node 22 tests: 20 pass, 0 fail. Test sources: tests/reach-23-ui-contract.test.mjs and tests/reach-command-center.test.mjs.
- TypeScript typecheck and Next.js build: passed.
- Standalone demo mirror cmp: passed.
- Vercel deployment dpl_4mR1y9tb6S6peLQiRN7b73ArcWqx: READY at code SHA 54bb6f4693f60edf78c546395b32e00a1926b850.
- Preview URL: https://agency-control-gateway-oo2fqyd3f-georgealex1925-2750s-projects.vercel.app
- Browser HTTP from public web tool: not accessible; authenticated mobile/desktop and real staging DB persistence not verified.

## Remaining acceptance
1. Approve exact isolated preview DB/environment and enable layout storage only after inspection. Test save, reload and stale revision conflict using synthetic workspace records.
2. Validate authenticated dashboard, workspace switching and mobile/keyboard UX in staging browser.
3. Keep production, main, customer accounts, paid resources, provider sends, live OAuth and publishing untouched.
4. Next sidebar feature: All Features directory.
