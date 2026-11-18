# REACH 2.3 Command Center — isolated database and persisted-layout hardening
Date: 2026-11-17
Repository: georgealex55/agency-control-gateway
Staging branch: experiment/reach-23-ui-redesign-staging-20261115
Starting HEAD: ffa3e0e6d4cec915eaa3005490a1e57f58ab71e1
Verified code HEAD: e5e120508af699f3f4c79dab3bf4d7c79b7a0d81

## Scope and delivered changes
- Added exact-branch isolated storage validation to the underlying authenticated /api/platform/workspaces GET and POST route, and to the common social API gate. These routes could otherwise be directly called while the Command Center UI refused access. The additional gate only affects the specifically named REACH 2.3 staging successor, leaving other historical branches unchanged.
- The existing owner-authenticated Command Center preflight still requires preview environment, exact staging branch, owner approval flag and an approved SHA-256 fingerprint of the selected platform database credential before any workspace data requests are made. No Vercel or Neon settings were changed in this pass.
- Implemented read-only loading of an already-stored dashboard layout even if the layout write flag is disabled, provided the database itself is explicitly approved. The read-only SQL path looks up the table via to_regclass without CREATE TABLE; if the layout table does not yet exist, it returns the default layout without side effects.
- Kept explicit schema-creation/save logic only behind the separate layout write flag, optimistic revision compare-and-set and audit receipt. Invalid saved layout JSON/revision fails closed. Cross-workspace access remains scoped by workspace UUID and owner session.
- Moved layout SQL execution into a small common adapter, permitting actual TypeScript function testing against synthetic workspace records without touching Neon. Existing source and Next.js Social Studio, calendar, dummy DEMO shell, auth, tenant IDs and publishing restrictions are preserved.
- Extended CI triggers to cover workspace/social gate changes.

## Executed validation
- GitHub Actions: https://github.com/georgealex55/agency-control-gateway/actions/runs/44221793323
- Exact verified code SHA: e5e120508af699f3f4c79dab3bf4d7c79b7a0d81
- GitHub Actions results: 25/25 static security and UI contracts passed; 10/10 runtime tests using synthetic workspace data and mocked HTTP/SQL passed; TypeScript typecheck passed; Next.js build passed; offline REACH public shell mirror equality passed. Both jobs completed successfully.
- Synthetic replay (mocked SQL executor, NOT a real PostgreSQL engine): an absent layout table is read without DDL; first save creates a revision 1 record; read-only reload preserves the layout; subsequent save advances revision to 2; a stale revision cannot overwrite; nonexistent workspace cannot create a record; separate synthetic workspace has an independent revision and audit records. This does not prove real PostgreSQL behavior or real credentials.
- Vercel staging code deployment dpl_GrfdZhmCty6cVajx4EDxE8Bstwim: READY at the exact code SHA above, preview https://agency-control-gateway-5g9p1nnc3-georgealex1925-2750s-projects.vercel.app . This is deployment status, not an independently authenticated browser test.

## Required approvals before real persistence
1. Identify and approve an exact isolated non-production Neon database target, including explicit consent for any branch/computes or incurred resource costs. Historical staging databases are not automatically approved and must not be deleted/reset.
2. Vercel currently has an AGENCY_PLATFORM_DATABASE_URL configured for multiple environments (production, preview, development) per prior metadata-only audit. It must not be reused on the new staging branch by assumption. Configure a branch-specific database credential override and owner auth only after verifying isolation and explicit approval.
3. Configure branch-scoped sensitive REACH_COMMAND_APPROVED_DATABASE_SHA256 and REACH_COMMAND_ISOLATED_STORAGE_ENABLED=true for that exact target. Only then consider REACH_COMMAND_LAYOUT_WRITES_ENABLED=true for synthetic acceptance. No keys, passwords, connection strings or fingerprints were generated or disclosed here.
4. Run real isolated PostgreSQL test transactions with fictional workspace rows: insert, reload, update, stale conflict, absent workspace, cross-workspace isolation, invalid layout, same-origin and cookie gates, audit receipt and rollback/cleanup. No real database test was executed here.
5. Independently test owner sign-in, responsive/mobile navigation, read-only layouts, saving after opt-in, keyboard focus, refresh and error-recovery paths in the authenticated preview browser. Not yet verified.

## Safety
No production/main commits, shared credentials changes, live customer data reads, Neon schema writes, external publishing, SMS, DMs, automated post scheduling, or paid resource provisioning. No claim of real social connections or live business analytics.

## Final environment-promotion safety check (same development pass)
- Final tested behavioral code SHA: 88711d2ccb2d3716e36b62b8e6495c071ba463c8.
- The exact REACH 2.3 branch is now recognized separately from preview status. Workspace GET/POST and the common social API gate require an approved isolated database whenever the branch ref matches REACH 2.3, **including an accidental non-preview deployment**. The separate Command Center preflight and layout endpoints continue to require VERCEL_ENV=preview and the exact branch, so no new operational access is activated outside preview.
- GitHub Actions https://github.com/georgealex55/agency-control-gateway/actions/runs/44222168575: completed SUCCESS at behavioral SHA 88711d2c. Native contracts 25/25 passed; synthetic runtime tests 10/10 passed; TypeScript check, Next.js build and standalone-demo mirror comparison all passed.
- Vercel deployment dpl_GQbvRdmBZ4nhLHJ5YUHeqDXCau7M READY at the exact behavioral SHA, preview https://agency-control-gateway-816cd7ui1-georgealex1925-2750s-projects.vercel.app . A READY deployment does not verify live authenticated data access.
- Vercel branch-specific environment variable inventory for experiment/reach-23-ui-redesign-staging-20261115: zero entries. No new flags, secrets, credentials, branches, database operations, provisioning, schema changes, or paid resources were introduced.
- All synthetic SQL assertions use an in-memory executor representing fictional workspaces. They do not prove actual PostgreSQL transactions, Neon connectivity, a logged-in owner browser session, or real business analytics.

**Explicit approval required before activation:** Select an isolated non-production Neon database/branch and authorize any necessary resource setup; then approve branch-only Vercel owner credentials, DB URL, fingerprint, isolation flag and optional layout writes. Independently test against that approved database with fictional workspaces and audit receipts. Do not reuse the globally scoped platform URL by default.
