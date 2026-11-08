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
