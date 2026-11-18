# REACH CRM — GoHyperLevel functional staging audit

**Date:** 2026-11-04  
**Candidate:** BAISESYSTEMS/GoHyperLevel@24ea786b85c3240ae4f24dcad6f657749730c56e  
**REACH experiment branch:** experiment/gohyperlevel-synthetic-poc-20261104  
**Verified workflow commit:** 8538548e35b6fd5e01973e1263371d6026a7ef9e  
**GitHub Actions run:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41933786062  
**Editor evidence:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41933786062/artifacts/13373610800  
**Final workflow status:** SUCCESS

## What was executed, not merely inspected

All testing occurred on an ephemeral Ubuntu runner with Node 22, locally bound HTTP, randomly generated synthetic test credentials and temporary SQLite storage. The original candidate source is pinned to the immutable revision above and not altered persistently. The REACH tests were copied into the disposable checkout only. No GHL import, real customer account, Meta connection, posting, email/SMS provider, Vercel production deployment or production Neon data was used.

| Verification | Evidence | Result |
| --- | --- | --- |
| Verify pinned upstream SHA | GitHub runner | PASS |
| Install dependencies and typecheck | npm ci, npm run typecheck | PASS |
| Original upstream API integration baseline | tests/api.test.ts, 23 tests | 23/23 PASS |
| REACH isolated functional journeys | audit/gohyperlevel/reach-functional.test.ts, 4 tests | 4/4 PASS |
| Original production build | npm run build | PASS |
| Distributed dependency licenses | npm run licenses | PASS |
| Node startup and SQLite persistence after restart | scripts/gohyperlevel-poc-smoke.mjs | PASS |
| Actual React funnel editor | Chromium + audit/gohyperlevel/reach-editor-browser.mjs | PASS |
| Desktop and phone preview screenshots | GitHub artifact | 2 screenshots captured |
| Uncaught browser page errors | Chromium pageerror listener | 0 |

### Real funnel editor

The React page builder was exercised in Chromium, not only through API calls. The synthetic administrator opened the original funnel editor, dismissed first-run onboarding, selected the Hero block in the structure tree, edited the Hero heading in the inspector, verified unsaved iframe live preview, added a Text block from the palette, edited its content, saved the page and read both changes from the real backend. Phone preview mode was selected and desktop/mobile screenshots recorded. Separate REST tests saved nested sections, SEO metadata, second pages and verified unsaved previews did not modify persisted page content.

### LMS

The functional test created a course with empty initial outline, created one module and two published lessons, edited a lesson, previewed an unsaved title, published the course, enrolled a dummy learner, captured the dummy login link without sending external email, opened the learner portal using an isolated member cookie, completed both lessons and verified progress moved from 0% to 50% to 100%. Neither real student accounts nor real mail transports were used.

### Safe workflow execution

An active workflow used only internal add_tag -> wait -> add_tag -> create_task steps. No email/SMS/webhook/publishing step was invoked. The test verified a waiting state, advanced the due timestamp on the isolated database, used the original tick scheduler, confirmed completion and verified the internal task was not duplicated after a subsequent scheduler tick.

### Cross-client isolation

The test created a second synthetic client/sub-account and separate contact, funnel, course and workflow. An administrator scoped to client A received 404 for B's record IDs; attempts to patch B's funnel or enroll in B's workflow were denied. A synthetic member with access to A, when requesting B through location headers, received 403 on the tested reads and a write. The B records remained unchanged.

This is basic client-boundary coverage; it is not a full authorization/security audit. Public websites and learner portals intentionally have their own auth models.

## Broader upstream suite remains a release blocker

A separate full-suite workflow on the same pinned candidate ran earlier at https://github.com/georgealex55/agency-control-gateway/actions/runs/41928291924. The original suite had 5,936 passing tests, 10 failing tests and 8 skips (7 files failed). This is distinct from the 23 API and 4 REACH integration tests reported above. Failures included:

- tests/sec-w10-crm-access.test.ts — forecast data and hidden deal values; investigate data visibility.
- tests/races2.test.ts — date/birthday workflow catch-up.
- tests/voice-outbound.test.ts — multiple outbound call and voice flow assertions.
- tests/academy.test.ts — generated handbook mismatch.
- tests/creator-dunning.test.ts — finance reminder calculation.
- tests/demo.test.ts — seeded demo statistics.
- tests/mk-sto.test.ts — campaign send-time optimization.

Do not label the complete upstream candidate production-ready until the failing tests are classified, reproduced and resolved or safely excluded from the chosen configuration. In particular, the failing restricted-deal forecast assertion requires a targeted security review. The assertion involves absence of 50000/777 values from a member response; the logs alone do not prove which response field contained them.

## Outstanding gates for any controlled replacement

1. Verify tenant isolation with API keys, MCP calls, private documents, course portals and field-level CRM restrictions under multiple authorization roles; replay the failing deal-forecast test.
2. Conduct deeper browser/editor UX review of drag-and-drop, editable sections, mobile truncation, accessibility and AI prompt-to-section (requires a separate test AI provider).
3. Test LMS advanced teaching requirements: quizzes, assessments, certificate generation, chapter/video controls, lesson deletion and re-enrollment lifecycle.
4. Stress workflows for idempotence, restarts, retries, long waits and connector coverage. Repair/review date-catchup failure before any production automation.
5. Validate SQLite backups and restores, disk capacity, concurrency, secrets, tenant policy and network access controls on an actual durable persistent host.
6. Deploy a separate test Postiz with no live Meta accounts for integration/OAuth checks. GoHyperLevel's social planner delegates publishing to Postiz.
7. Review GoHyperLevel AGPL-3.0 compliance before a modified hosted release.
8. Demonstrate functional parity with Frappe/Activepieces/other pinned engines before proposing replacements.

## Recommendation and safety state

**Recommendation: Continue the GoHyperLevel + Postiz proof of concept, but do not migrate or switch engines.** The foundational authoring, learner progress, safe workflow and basic client boundary checks now pass. The broader upstream failures, advanced feature gaps, security/privacy checks, persistent hosting and Postiz integration remain release blockers.

**Production:** No merge to main; main remains a745db200febb8cf752dad0dea9502d69451c7de as verified after the workflow.  
**Real customer data:** Not accessed or changed.  
**GHL accounts:** Not imported or changed.  
**Meta accounts/social publishing:** Not connected or activated.  
**New runtime:** Temporary GitHub runner only; no persistent GoHyperLevel host was provisioned.

### Reproduction

Workflow: .github/workflows/gohyperlevel-poc.yml  
Source fixture: audit/gohyperlevel/reach-functional.test.ts  
Live editor script: audit/gohyperlevel/reach-editor-browser.mjs  
Persistence script: scripts/gohyperlevel-poc-smoke.mjs
