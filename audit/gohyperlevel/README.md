# GoHyperLevel proof of concept — isolated tests and UI screenshots

**Goal:** Run the actual upstream source without replacing any current Agency Control engines or touching production.

**Pinned upstream SHA:** `24ea786b85c3240ae4f24dcad6f657749730c56e` from `BAISESYSTEMS/GoHyperLevel`.

## Workflow

See `.github/workflows/gohyperlevel-poc.yml`. A GitHub-hosted Ubuntu runner checks out the exact upstream SHA with `contents: read` permissions and no persisted checkout credentials. The source-validation job installs Node 22 dependencies and executes typechecking, upstream synthetic tests, and the original production build.

A separate job builds the original Docker image locally, launches it on localhost:4700 using a throwaway SQLite data directory and randomly generated synthetic administrator, then checks both original health endpoints, API authorization and bounded read-only module APIs. Chromium screenshots are generated at desktop and phone widths for the Dashboard, Contacts, Opportunities, Funnels, Courses, Workflows and Social pages.

## Evidence

- Workflow run logs show build, test and runtime status. Do not treat an in-progress workflow as a pass.
- A GitHub Actions artifact named `gohyperlevel-pinned-ui-audit` contains **only** screenshots and `audit-summary.json` with sanitized results. The database, session cookie and password are not included.
- The artifact retains for 14 days and needs a manual screenshot/UI quality review.
- If the Docker runner cannot start, distinguish upstream failure from runner environment and testing assumptions before deciding on migration.

## Boundaries

No Vercel, Neon, Meta, GHL or actual client credentials are provided to the untrusted upstream code. No public app/domain deployment, social publishing, data import or external integrations are enabled. Runner contents are disposable. No changes to the pinned original source are made.

**Decision remains source-level recommendation only.** Even a clean CI and screenshot smoke do not establish workflow correctness, Frappe/Activepieces feature parity, multi-workspace isolation, long-running jobs, backups/restore, API hardening or acceptable editing UX.

## Next acceptance tests

Use the screenshots to identify visual/navigation issues. Then run synthetic lead-to-pipeline, prompt-to-page, course enrollment/progress, workflow wait/retry and tenant-boundary tests on a dedicated persistent test host before considering GoHyperLevel + Postiz as a production architecture. Preserve the original five-engine branch for rollback.

Primary source audit: `docs/audits/gohyperlevel-source-audit-2026-11-04.md`.