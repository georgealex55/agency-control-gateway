# REACH CRM — Access-control and workflow recovery audit

**Date:** November 4, 2026 local time
**Candidate source:** BAISESYSTEMS/GoHyperLevel commit 24ea786b85c3240ae4f24dcad6f657749730c56e
**Development branch:** experiment/gohyperlevel-synthetic-poc-20261104
**Failing baseline:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41941422822
**Fixed targeted run:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41941576092
**Full integrated staging rerun:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41941855162
**Patch:** scripts/reach-security-patch.mjs
**Tests:** audit/gohyperlevel/reach-security.test.ts

## Confirmed and reproduced security bug

A GoHyperLevel API key may be explicitly bound to a team member. Area permissions already follow that member; however, the pinned source returned unrestricted record access on direct REST calls made using the member-bound key. This differed from the same member's browser and their MCP relay, which honored hidden fields and own-only restrictions.

The source-level cause was the unconditional exception for both api_key and agency_key request modes in server/services/record-access.ts. This disabled the record-access checks, even when the bearer key had a genuine member identity.

Baseline experiment (disposable SQLite, synthetic users): a member was limited to their own opportunities and forbidden to see deal amount fields. Their browser session correctly masked totals and only showed their owned deal, but the same member's REST key returned combined synthetic opportunity amounts of **50,777** (synthetic 777 and 50,000). The test failed as expected.

Original upstream sec-w10-crm-access.test.ts passed independently in this baseline run, so the earlier full-suite restricted-forecast assertion failure has not been exactly reproduced; do not conflate that historical test failure with the independently reproduced member-key leak.

## Scope of isolated fix

The REACH overlay removes the blanket exception for direct member-bound API keys while preserving the exception for agency keys. Unbound keys still use an administrative identity and preserve existing broad access. Member-bound keys carry a real non-admin identity and now honor the member's rules on direct REST, consistent with the browser and MCP.

The overlay runs only in a temporary pinned upstream checkout during GitHub Actions CI. It checks that each expected source fragment matches exactly once and fails closed on upstream drift. No upstream GitHub repository commit, production build or real persistent staging runtime is modified.

The patch also updates source comments and in-app explanatory text so users understand that bound keys inherit member restrictions but unbound and agency-level keys remain privileged.

## Verified results

**Patched targeted run: SUCCESS** (GitHub Actions 41941576092).

| Validation | Result |
| --- | --- |
| Original restricted field history, forecast and private-document tests | PASS |
| Member-bound REST API key deal amount and custom-field masking | PASS |
| Member session masked forecast and custom-field view | PASS |
| Restricted member key cannot read tenant B record IDs | PASS |
| Bound MCP forecast masking and tenant boundary denial | PASS |
| API read-only agency key disallows POST directly and via MCP | PASS |
| Unbound privileged integration key retains existing behavior | PASS |
| Stale running workflow checkpoint resumes from next step | PASS |
| Recovery creates one internal task despite a second scheduler tick | PASS |
| Broken local workflow step can be repaired and retried without replaying earlier tag step | PASS |
| Targeted original forecast suite plus new security suite | 18/18 tests PASS |
| Existing user-bound key plus workflow error/retry suites | 22/22 tests PASS |
| Full original TypeScript typecheck after patch | PASS |

The workflow tests perform only local actions (tags, tasks and notes), plus an intentionally malformed webhook without a URL. No outbound provider, customer account, Meta/GHL integration or publishing connector is connected.

The simulated crash-recovery test uses the real scheduler with a synthetic stale running record and previously saved cursor. A process-termination test on a persistent production-like volume has not been run.

## Earlier complete upstream suite and outstanding risk

The earlier broad upstream suite reported 5,936 passing tests, 10 failures, and 8 skips, including original forecast, birthday catch-up, outbound voice, and financial/demo assertions. This REACH change fixes the proven bound-key bypass; it does not resolve those other broad-suite failures. The original forecast suite is green independently here, while the cause of its prior broad-run failure is not yet established.

An unbound or agency API key remains privileged by design. These keys should never be distributed as credentials for a restricted client or staff member. A separate scoped issuance, rotation, expiry and revocation policy is needed before client onboarding.

The MCP coverage here tests relevant routes and key types but is not a complete cross-tenant sweep of every MCP tool or every role. Original upstream tenant-isolation and mcp-sweep suites exist and should be separately run before release.

## Safety and shipping decisions

- No merge or write to production main.
- No customer records, real GHL accounts, Meta accounts or Postiz publishers involved.
- All tests run on ephemeral isolated GitHub Actions runners.
- Existing staged agency engines, production database, user accounts and five-seat branch unchanged.
- No persistent GoHyperLevel deployment created.
- An independent integrated CI workflow has been updated to apply the same verified overlay before the existing funnel editor, LMS, and browser tests; its result is linked above.

**Recommended next gates:** run the expanded tenant/API-key/MCP authorization matrix; verify service termination and recovery on real persistent staging storage; review broader forecast and date-catching tests; validate privileged-key issuance controls; only then propose a staged deploy and rollout plan.
