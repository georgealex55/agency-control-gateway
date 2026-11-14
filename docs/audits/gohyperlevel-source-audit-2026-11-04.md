# GoHyperLevel vs the original Agency Control engines — source audit

**Audited:** November 4, 2026
**Candidate:** https://github.com/BAISESYSTEMS/GoHyperLevel
**Pinned upstream commit:** 24ea786b85c3240ae4f24dcad6f657749730c56e
**Audit scope:** GitHub source, unit/integration test sources, Compose, CI workflow, and UI file inventory. This is NOT a deployed app, independently executed test suite, performance test, or screenshot-based UX audit.

## Decision

**Evaluate but do not migrate.** The original five-engine integration remains staged and unchanged. GoHyperLevel could consolidate CRM, website building, learning and common workflow automation into one long-running Node application, while retaining Postiz for actual social OAuth, scheduling and publishing.

**Important infrastructure limits:** GoHyperLevel uses node:sqlite (server/core/db.ts) and an on-disk pghl.db under PGHL_DATA_DIR (server/config.ts); docker-compose.yml mounts a persistent /data volume. It is not a drop-in Neon backend or an entire Vercel Serverless deployment. The social planner expressly calls Postiz's external public API.

## Evidence matrix

| Area | Existing engine | Source evidence in GoHyperLevel | Source finding | Runtime gate |
|---|---|---|---|---|
| CRM and pipelines | Frappe CRM | [server/modules/contacts.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/contacts.ts), [server/modules/pipelines.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/pipelines.ts), [tests/api.test.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/tests/api.test.ts) | Contact and deal pipeline routes, data model and sample integration tests exist | Test deduplication, access rights, imports, scale and activity logs |
| Website and funnels | Frappe Builder | [server/modules/funnels.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/funnels.ts), [server/modules/site-design.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/site-design.ts), [server/services/site-layout.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/services/site-layout.ts), [server/modules/site-ai.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/site-ai.ts) | Site rendering, design tokens, section/row/column/blocks and AI site modules exist | Test editor quality, prompts, responsive behavior, domains, SEO and forms |
| Courses and memberships | Frappe Learning | [server/modules/courses.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/courses.ts), [server/services/courses.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/services/courses.ts) | Course, lesson, enrolment and learner portal code exists | Test teacher journeys, quizzes, grading, tracking, certificates and UX |
| Workflow automation | Activepieces | [server/modules/workflows.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/workflows.ts), [server/services/workflow-engine.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/services/workflow-engine.ts), [server/modules/workflow-canvas.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/workflow-canvas.ts) | Native workflow execution and canvas integration exist | Test long-running waits, retry/idempotence, automation reliability, connector breadth |
| Social publishing | Postiz | [server/modules/social.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/social.ts), [server/services/postiz.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/services/postiz.ts) | Social planner delegates OAuth, publishing and schedule handling to separate Postiz | Postiz still required; test tokens, schedule, media, analytics, scopes |
| Booking and calendars | Standalone integrations | [server/modules/calendars.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/calendars.ts), [server/modules/calendar-view.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/calendar-view.ts) | Booking and calendar view handlers exist | Test timezone, availability, conflicts, real provider connections |
| Inbox and channels | CRM providers | [server/modules/conversations.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/conversations.ts), [server/modules/channels.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/channels.ts) | Messaging/inbox backend exists | Test deliverability, opt-out, permissions, provider billing |
| Agent and operations | Agency Control APIs | [server/modules/mcp.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/modules/mcp.ts), [server/core/app.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/core/app.ts), [server/core/db.ts](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/server/core/db.ts), [docker-compose.yml](https://github.com/BAISESYSTEMS/GoHyperLevel/blob/24ea786b85c3240ae4f24dcad6f657749730c56e/docker-compose.yml) | REST/MCP agency tools and persistent Node/SQLite runtime exist | Test access control, tenant isolation, backups, logs, SQLite concurrency |

## Source and operations findings

1. The app is a real Node backend, not just a front-end template. server/index.ts wires loadConfig, bootstrapAdmin, createApp, modules and a listening server. server/modules/index.ts imports real business modules.
2. Frontend source is a React/Vite application under web/src/pages, web/src/workflow-canvas and related UI directories; a real editor and mobile UX assessment REQUIRES launching a staging server.
3. The repository includes tests/api.test.ts and a CI workflow with npm ci, typecheck, Vitest, build, license checks and Docker health checks. Existing GitHub workflow history includes passing Docker builds; these tests were NOT independently rerun for this audit.
4. The social planner (server/modules/social.ts) clearly states the original Postiz service handles OAuth tokens, scheduler and provider APIs; server/services/postiz.ts only wraps its public API.
5. Workflow engine and visual workflow modules exist, but they are not proven substitutes for Activepieces connector ecosystem or durable job handling.
6. Courses and websites have substantial backend implementations, but teacher experience, page editing ease, mobile layout and real customer outcomes remain untested.
7. License is AGPL-3.0. Assess network-use and modification/source distribution obligations before a hosted or modified release.
8. The upstream project was created October 22, 2026 and had about 11 stars and 25 open issues when checked on November 4. These are context, not quality or security test results.

## Automated acceptance gates (none are yet complete for the candidate)

- Pin the exact source commit and run Node 22 npm ci, typecheck, test, build and Docker /healthz on isolated synthetic data.
- Visually audit UI navigation, branding, editor, drag/drop, prompt-to-section, mobile and accessibility using an actual running instance.
- Verify CRM lead->pipeline->followup, page preview/publish, learner enrollment/progress and workflow wait/retry with no real client records.
- Verify cross-workspace isolation and internal admin roles, token handling, auth, audit logging and API/MCP permissions.
- Restart the Docker process and test SQLite data persistence, backup, restore and concurrent API access.
- Deploy a separate read-only Postiz test account and verify the GoHyperLevel API integration without connecting production Meta accounts.
- Review AGPL obligations, feature parity and upstream dependency compatibility before any controlled replacement.

## Proposed architecture if and only if tests pass

Agency Control continues on Vercel + Neon (one administrator). GoHyperLevel becomes the primary external persistent engine for CRM, websites/funnels, LMS and common workflows. Postiz remains a separate persistent service for social publishing. Activepieces and Frappe are retained as alternatives until feature parity is demonstrated.

## No-change guardrails

- No current engine has been disabled, removed or replaced.
- No deployment or data migration to GoHyperLevel has happened.
- No Docker host, Postiz instance or new paid services were provisioned.
- No production, client data, existing GHL data or Facebook connection configuration was changed.

**Final source-only recommendation:** Prioritize a GoHyperLevel + Postiz proof of concept, but do not select GoHyperLevel as the main engine until independent end-to-end and visual audits pass.

Additional primary source: [24ea786b85c3](https://github.com/BAISESYSTEMS/GoHyperLevel/tree/24ea786b85c3240ae4f24dcad6f657749730c56e).