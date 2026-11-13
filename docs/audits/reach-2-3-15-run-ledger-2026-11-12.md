# REACH 2.3 — 15-run staging development ledger

**Repository:** georgealex55/agency-control-gateway  
**Allowed branch:** `experiment/gohyperlevel-synthetic-poc-20261104` (STAGING ONLY)  
**Scope:** owner-first revenue recovery, tenant-isolated synthetic opportunities, owner-approved actions, and a Business Opportunity Center. Keep all integration configuration and data-source setup under the unified **Connections** tab; do not scatter connection forms or credentials across business-workflow screens. Production, paid resources, external sends and real customer records excluded.

## Run 1 — 2026-11-13T05:01:44.253Z
- **Ordinal:** 1, because this persistent ledger did not exist at starting HEAD; no earlier REACH 2.3 numbered entries were present. **Starting HEAD:** `b1ad1b35f761f91ecf0a86feadc17da3401c88a4`.
- **Baseline inspected:** REACH 2.2 ledger, social eight-run final report, native shell CI workflow, shell tests and current offline shell; previous Actions [43254740424](https://github.com/georgealex55/agency-control-gateway/actions/runs/43254740424) had a failed shell regression step, while auth/tenant/schema/API/syntax steps passed. Social CI [43349513143](https://github.com/georgealex55/agency-control-gateway/actions/runs/43349513143) succeeded. No new real HTTP/browser or database execution performed.
- **Reproduced pre-edit limitation:** `reach-shell/shell.test.cjs` asserted assistant copy `not generative AI` but current `reach-shell/index.html` actually renders `Deterministic demo commands only · no AI model, API calls or outbound actions.` This is a stale test expectation confirmed by inspecting source, not by running the native suite.
- **Concrete milestone:** updated one shell assistant regression assertion to require the exact current, stronger offline/no-model/no-outbound wording, preserving all other checks. [Feature commit](https://github.com/georgealex55/agency-control-gateway/commit/53923f9086fac7dd561d862aa3b2c26ad60ecc0d).
- **Files changed:** `reach-shell/shell.test.cjs`, this ledger. Standalone shell HTML not changed; mirror `ghl-gpt-gateway/public/reach-demo/index.html` remained at blob `a7875fabd754f50ea8b3c20cc7433158ace09ed5`, same as inspected shell blob. No credentials or real customer data touched.
- **Executed evidence:** GitHub accepted the test commit; Actions [43369245486](https://github.com/georgealex55/agency-control-gateway/actions/runs/43369245486) was IN PROGRESS at checkpoint (post-change test counts unverified). Local `git ls-remote` failed DNS resolution of github.com; **no native local Node test ran**. Vercel test commit BUILDING; previous social sprint HEAD preview READY. Do not infer browser usability from READY.
- **Outstanding:** other shell failures may remain; no full Next build, actual HTTP/browser/mobile, Neon or social provider verification. Reconcile CI output next run before declaring this regression fixed.
- **Next:** ordinal 2 — tenant-isolated opportunity schema and reversible migration / synthetic repository boundary, after reviewing current tests and existing staging schema.
- **Ending HEAD:** this ledger creation commit (GitHub-generated SHA; resolve from branch history). 
