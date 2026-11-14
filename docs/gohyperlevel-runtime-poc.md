# REACH CRM — GoHyperLevel synthetic runtime proof of concept

Date: 2026-11-04
Branch: experiment/gohyperlevel-synthetic-poc-20261104
Source baseline: f00402a2617973d6dfd8334e0635936378574749
Pinned candidate: BAISESYSTEMS/GoHyperLevel commit 24ea786b85c3240ae4f24dcad6f657749730c56e

## Decision and boundaries

Test the candidate in isolation. Do not migrate or change the five original engines, the Next.js control plane on production, live GHL data, Meta accounts or actual client information. No new paid service is required for this temporary test. The agency remains single-admin; no client access is introduced.

GoHyperLevel requires a separate persistent Node runtime with SQLite storage, not the existing Vercel serverless app. Postiz remains a separate social publishing service. The current Frappe/Activepieces/Postiz integrations stay staged and unchanged.

## Automated checks added

The GitHub Actions workflow at .github/workflows/gohyperlevel-poc.yml:

1. Checks out the candidate at its exact pinned immutable SHA and verifies HEAD.
2. Uses Node 22 to run npm ci, typechecks and the upstream tests/api.test.ts integration suite against test data, builds the web and server bundles, and checks distributed dependency licenses.
3. Boots an ephemeral GoHyperLevel server on loopback with a synthetic admin identity and a unique temporary SQLite directory.
4. Verifies healthz, api/version, api/auth/status and admin bootstrap; checks database creation, restarts the server and verifies SQLite persistence.
5. Stops the process and deletes temporary SQLite files. No upstream publishing or production action is authorized.

A passing automated suite does not prove multi-tenant isolation, production security, visually polished editing, external integrations or that GoHyperLevel can replace all existing engines.

## Acceptance gate matrix

| Gate | State |
| --- | --- |
| Source-level audit and candidate selection | Complete |
| Pinned candidate typecheck and API integration suite | Automated in new workflow; result requires Actions verification |
| Actual build, boot, SQLite restart persistence | Automated in new workflow; result requires Actions verification |
| CRM lead to pipeline to follow-up with multiple isolated clients | Independent isolation review outstanding |
| Page builder and prompt-to-section editor on desktop/mobile | Visual browser review outstanding |
| LMS instructor content, enrollment and progress | Real UX validation outstanding |
| Workflow waits, retried execution, connector parity | Reliability and parity outstanding |
| Postiz staging OAuth and social scheduling | Not connected |
| Backups, secrets, roles, AGPL-3.0 and data restoration | Outstanding |
| GoHyperLevel replacement in production | Not approved |

## Local replay

On an isolated development machine with Node 22.13+:

- Check out https://github.com/BAISESYSTEMS/GoHyperLevel at commit 24ea786b85c3240ae4f24dcad6f657749730c56e.
- In that checkout run: npm ci && npm run typecheck && npx vitest run tests/api.test.ts && npm run build
- In this Agency Control repository root run: node scripts/gohyperlevel-poc-smoke.mjs /absolute/path/to/GoHyperLevel

Never pass real API credentials, production user data, or customer information to these tests.

## Reversion

The temporary proof of concept lives only in an experiment branch. Delete that branch to remove its files; the original staging history and production main remain unmodified.
