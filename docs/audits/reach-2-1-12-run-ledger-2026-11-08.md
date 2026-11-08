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
