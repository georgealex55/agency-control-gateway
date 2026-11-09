# REACH 2.1 — 12-run staging development ledger (2026-11-08)

## Scope and acceptance
- Branch: `experiment/gohyperlevel-synthetic-poc-20261104`; production/main and real customers excluded.
- Foundation: `docs/audits/reach-shell-12-run-final-report-2026-11-06.md` (24/24 simulated actions, 11/11 simulated routes; 0 real-browser actions verified).
- Next milestones: 2 versioned shared local demo repository; 3 call/contact/task linkage; 4 inbox timeline; 5 appointment linkage; 6 dashboard derived metrics; 7 reports; 8 automation receipts; 9 assistant; 10 responsive design; 11 setup/provider interfaces; 12 final acceptance audit.

## Run 1 — 2026-11-08 UTC (staging)
- **Starting HEAD:** `933dcd3c00884625a3eecc9ab4452bf95e046d13`.
- **Concrete regression fixed:** persisted malformed localStorage JSON such as `[]`, `{\"tasks\":null}`, or incorrect calls/contacts/appointments shapes could propagate invalid collections into rendering. Hydration now validates collection shapes and falls back to seeded sample collections. Moved state initialization after the full set of seed definitions so contacts/appointments/presence fallback is actually populated. Valid stored task arrays and business profiles are preserved.
- **Files changed:** `reach-shell/index.html`, `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/persistence.test.cjs`, this ledger.
- **Source commits:** `b0af263d64c53010843e3f95a96c1e18fd13ace4`, `c6589ed740c5c7a74b6df63cab7bf2030d3eb6d3`; mirror commits `f1cf788957d3b0dbf4e3e585e5c2e04416088d6a`, `a0ccd7ddf97a2a87fc795badb31c97a3e6642091`; test commit `fb93747e7e86ba2c76d1241a8a2c174441dde08b`.
- **Executed in JavaScript V8:** original and repaired inline script compiled; three hydration cases (root array, malformed collections, valid preserved task/profile) returned expected data; repaired source and preview mirror Git blob identical `6135f413241dfc2e4b4b24e0590fe1a40c3ef6d2`.
- **Authored but NOT executed in native Node:** three `reach-shell/persistence.test.cjs` cases. Full `node --test reach-shell/*.test.cjs` and independent real-browser/mobile tests remain NOT RUN because local runtime cannot resolve github.com to check out the repository. Previous V8 acceptance results are historical, not revalidated for this commit.
- **Preview:** staging mirror updated, deployment READY and actual route load not yet verified; never describe it as browser-verified.
- **Next milestone:** implement a versioned shared local demo data repository with migration/seed/persistence tests, preserving existing sample records and the offline-only provider status.

## Run 2 — 2026-11-08 UTC (staging)
- **Starting code HEAD:** `b974683465b86cf7673970fa16b3a3bce7133fd9` (Run 1 ledger checkpoint; actual branch tip may include subsequent documentation commits).
- **Milestone:** implemented a versioned offline-only demo data repository (schema v2) in `reach-shell/index.html`. Existing v1 `reach-demo-state` records migrate in memory on read without losing business name, tasks, contacts or UI preferences; save stamps `__schemaVersion:2` at the same key. Invalid root and collection members recover to seeded local fixtures; reset clears and reseeds a versioned snapshot. No Neon, provider, customer or production changes.
- **Files changed:** `reach-shell/index.html`, `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/persistence.test.cjs`, this ledger.
- **Code commits:** source `a1fdbfa9aae6cb109bd37763b07a30d423a7fc49`, mirror `02667389a2d1466c7030067309804f329c5d8ae3`, tests `5100931ba8ad721d1c17ba3a09c1592e73f99dc1`, recovered-schema fix `653b597df8bc607438454f360761f5f8dd8d2920`, final mirror `0e5c9e694a7d5af0226710dbc80c2a21b6d3bf40`.
- **Executed V8:** inline script compiled; 3/3 repository hydration/snapshot scenarios PASS (v1 migration + save/reset, malformed v2, invalid root). Tests used synthetic DOM/storage and JSON clone shim; not native Node or a real browser.
- **Authored native Node tests:** 3 new persistence cases, total 6 cases; **not executed** in Node. No claim of Node CI or browser success.
- **Mirror:** source and staging preview Git blob SHA match `a7d47bfa79e1e0edd0316e83fcfdeb5db51200ef`.
- **Deployment:** Vercel combined commit status for `0e5c9e6` was **pending** at inspection; preview READY and route load unverified. Do not infer deployment success.
- **Next milestone (3):** link synthetic missed-call records with existing contacts and callback tasks idempotently; maintain legacy records and test reruns.

## Run 3 — 2026-11-08 UTC (staging)
- **Starting HEAD:** `744372b43049d559d4f86c3e48057906a7ce45ba`.
- **Milestone:** Missed-call callback actions now create or reopen one stable task per call ID, link it to an existing local contact by explicit call ID or matching phone, and reuse old callback task IDs. A second action completes the same task rather than deleting its audit record. No external calling, messaging, provider connections or production changes.
- **Files:** `reach-shell/index.html`, exact `ghl-gpt-gateway/public/reach-demo/index.html` mirror, `reach-shell/persistence.test.cjs`, this ledger.
- **Executed:** inline JavaScript V8 parse PASS; source/mirror content equality PASS before commit. Two new native Node tests authored, **NOT EXECUTED** in Node/browser; CI and preview route not independently verified.
- **Next milestone:** unify inbox messages, contacts and task states into a synthetic timeline.

## Run 4 — 2026-11-08 UTC (staging)
- **Starting checkpoint:** Run 3 staging code/ledger; read prior final report, current shell, preview mirror and ledger before edits.
- **Milestone:** Offline inbox customer timeline combines sample messages, uniquely linked contact calls, and callback task states. Ambiguous names do not merge. Existing local demo login and provider-disconnected state preserved.
- **Files:** `reach-shell/index.html`, `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/timeline.test.cjs`, this ledger.
- **Commits:** source `b5e5931d89ef23ff20e30b9771786c28897fe8bc`, mirror `400e7ccf2d9b679ab2ea7a32586143f5fe40dd1e`, test `59ea2b1012d1d8fce910726a167e9288b952fb3d`.
- **Executed:** V8 inline script syntax compile PASS. Mirror content submitted byte-for-byte identical to source. **Not executed:** 3 authored native Node tests, actual browser/mobile tests, and deployed preview route. CI/Vercel readiness not verified in this run.
- **Next:** milestone 5 appointment/contact/conversation linking.

## Run 5 — 2026-11-08 UTC (staging)
- **Starting code checkpoint:** Run 4 staging source `609e047f20a146ddf483fa11863624b350c64e1a` (prior ledger commit); current source read before edit.
- **Milestone:** Appointment create/edit now links only to a uniquely resolved conversation contact, and creates/reconciles one stable local preparation task per appointment. Rescheduling reuses task; cancellation marks it done, restoration reopens it. Appointment status appears in linked inbox customer timeline. Ambiguous matches remain unlinked. Existing appointments are preserved; no external calendars or messages.
- **Commits:** source `b72f3afdcf6cdeff3d16ef191c69a513b836ca12`, mirror `0eae732227d24f7f74b4ec5bb9102af7926ff6fa`, tests `2f5569472bc59d0756a8c5fa680627094ef8949f`.
- **Files:** `reach-shell/index.html`, `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/appointments.test.cjs`, ledger.
- **Verification:** inline V8 compile PASS; source/mirror Git blobs identical (`421a4ceb4291e36df36d27853d7b6077072d4651`). Three native Node test cases authored but NOT EXECUTED; browser/mobile and Vercel READY NOT VERIFIED. No production or customer changes.
- **Next:** milestone 6 derive dashboard metrics and action counts from shared offline demo data.

## Run 6 — 2026-11-08T21:00:00Z (staging)
- **Starting HEAD:** `9b6283ed3a302e62c05178eb0b1cb5e86bda43e2`.
- **Milestone:** Dashboard cards and drilldowns derive stored sample calls, missed calls, unread conversations, open tasks, pending callback tasks and sample Google-hours health from the shared offline state. Removed misleading hard-coded dashboard trend/count snapshots. The existing period control is retained for navigation compatibility but explicitly says totals are not date-filtered because legacy fixture timestamps are inconsistent. Reports & Metrics remains unchanged for milestone 7.
- **Files:** `reach-shell/index.html`, exact `ghl-gpt-gateway/public/reach-demo/index.html` mirror, `reach-shell/dashboard.test.cjs`, this ledger.
- **Validation:** static source assertions and exact source/mirror string equality checked before commit. Three native Node regression tests authored, **not executed**; no claim of browser or build verification. Existing V8/CI status was inspected; no new external provider actions.
- **Commits:** feature + mirror + test + ledger `9974cb99796bc53ec15c1faa9f57fbd0d5a86eef`; test harness regex correction `38c26013443d249d048f1cfaf0e5eded46d06598`. Ending HEAD after ledger update: see this ledger commit. Source/mirror blob SHA `d00356e3fa11c4b23b55782013516c518f3d19ef` (identical). GitHub status check list empty for feature commit; Vercel preview for feature commit was BUILDING at inspection, prior milestone 5 preview READY. Native Node and real-browser testing not run.
- **Next:** milestone 7, derive Reports & Metrics from shared offline records while explicitly separating sample fixtures from live analytics.

## Run 7 — 2026-11-08 UTC (staging)
- **Starting HEAD:** Run 6 ledger checkpoint (source/mirror blob `d00356e3fa11c4b23b55782013516c518f3d19ef`); ordinal 7 determined from six previous ledger entries.
- **Milestone:** Reports & Metrics now derives call, missed-call, conversation, unread-conversation, appointment and cancellation counts from current offline shared demo collections, instead of misleading fixed 7/30/90-day fixture totals. Source filter remains functional; period selection remains visible but explicitly does **not** filter until legacy fixture timestamps are normalized. No real analytics, providers, production or customer data involved.
- **Files:** `reach-shell/index.html`, `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/reports.test.cjs`, this ledger.
- **Code commits:** source `9d635135dda6d599897dd7ff88de9a66221f52e9`; preview mirror `6e86bbd56359e36623f7fefb6cb7d98f926aeaa0`; two authored Node regression tests `cbadea9c8dfabaed3bba57da9075239f52ebf3c5`.
- **Executed V8:** full inline JavaScript syntax compilation PASS; synthetic report data assertion (2 calls/1 missed, 2 conversations/1 unread, 1 cancelled appointment) PASS; explicit period limitation assertion PASS. **Native Node tests authored, NOT EXECUTED.** Real browser/mobile and deployed route remain unverified.
- **Mirror:** Git blob `cd9d54afa24e4a84ea38a86479bc6e6ae4f8edc0` for both source and preview; identical=true.
- **Next:** milestone 8, improve offline automation receipts and idempotent replay safeguards.

## Run 8 — 2026-11-08T23:02:00Z (staging)
- **Starting HEAD:** `65766d6398f8deae7691537c3495da0df9772606`; ordinal 8 established from seven prior ledger entries. Reviewed prior REACH 2.0 acceptance report, staging source/mirror, CI and Vercel status before editing.
- **Milestone:** Automation replay protection now maintains a persistent processed-key index separate from the 40-entry receipt display history. Existing receipts migrate into the index; orphaned tasks from older snapshots recover a receipt without creating a duplicate. Disabled/mismatched rules remain no-ops. All operations are local synthetic simulation, not external delivery.
- **Files:** `reach-shell/index.html`, identical `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/automation-replay.test.cjs`, this ledger.
- **Executed V8:** full inline script compile PASS; 7 synthetic functional checks PASS (first execution, replay, truncated receipts, orphan recovery, disabled, mismatch, independent event), plus syntax check PASS. **Native Node:** five authored tests NOT EXECUTED. **Real browser/mobile:** NOT RUN. No assertion of deployed route correctness.
- **Source/mirror:** exact same submitted UTF-8 content; verify Git blobs after commit. GitHub prior HEAD Vercel commit status: success; new deployment status must be checked independently.
- **Ending HEAD:** this milestone commit (see Git history). **Next:** milestone 9 deterministic assistant demo commands with provenance and safe local-only behavior.

## Run 9 — 2026-11-09T00:00:17Z (staging)
- **Starting HEAD:** `85a275ad4f0cd46c4ba66df19e7b4169d5c4df8e`; ordinal 9 from eight prior ledger entries.
- **Milestone:** strict typed-command parser for four offline assistant intents, explicit unsupported-command rejection, provenance and disconnected-provider status, stable daily-review task identity; legacy menu actions preserved. No external AI/provider calls.
- **Files:** `reach-shell/index.html`, identical `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/assistant.test.cjs`, this ledger.
- **Executed:** V8 full inline syntax compile PASS, 7 parser assertions PASS, source/mirror identical. Three native Node tests authored but NOT EXECUTED. Browser/mobile NOT RUN.
- **Next:** milestone 10 premium responsive dashboard and keyboard accessibility.

## Run 10 — 2026-11-09T01:00:56Z (staging)
- **Starting HEAD:** `100276b0783c4d020c905a8eb43608ab967d6955`; ordinal 10 determined from nine ledger entries. Prior REACH 2.0 report, current shell, preview mirror, branch tree and CI inspected before editing.
- **Milestone:** premium owner-first navy navigation, light card workspace, responsive 3/2/1 column layout, fixed scrollable mobile drawer, stronger focus visibility, improved contrast, reduced-motion support, and updated REACH 2.1 title. Existing 11 routes, sample login, demo data and disconnected-provider states preserved.
- **Files:** `reach-shell/index.html`, identical `ghl-gpt-gateway/public/reach-demo/index.html`, `reach-shell/design.test.cjs`, this ledger.
- **Executed in V8:** inline script compile PASS and 10/10 static/safety assertions PASS, including baseline source/mirror equality. New source and mirror submitted as identical strings. **Native Node tests authored, NOT EXECUTED**; real browser/mobile/keyboard screen-reader testing NOT RUN.
- **Commit:** this single staging commit from `100276b0783c4d020c905a8eb43608ab967d6955`. No production, providers, paid services or customer data modified.
- **Next:** milestone 11 setup/status walkthrough and disconnected provider-adapter contracts with expanded tests.
