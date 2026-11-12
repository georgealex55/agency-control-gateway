# REACH 2.2 — 12-run staging development ledger

Branch: `experiment/gohyperlevel-synthetic-poc-20261104`. Staging-only synthetic work; no main merge, production deployment, real customer records, paid resources, secrets or provider sends. Ordinal is determined only by completed numbered entries below.

## Run 1 — 2026-11-12T06:02:56.881Z
- **Starting HEAD:** `e9b3f4aed48232f978a1156e6ae46f0f008a8c15`; prior REACH 2.1 final report inspected, including 24/24 synthetic DOM actions, 11/11 synthetic routes, and unexecuted native Node/browser checks. Repository tree, shell test harness, README and existing GitHub workflow inspected. Ledger did not exist, so ordinal = 1.
- **Concrete milestone:** created `.github/workflows/reach-2-2-shell-ci.yml` on staging, introducing a real native Node 22 regression gate for `node --test reach-shell/*.test.cjs`, source/mirror byte comparison via `cmp`, and inline application script syntax compilation. Trigger limited to the existing staging branch and shell/workflow paths; checkout has no persistent credentials, workflow is read-only and uses no secrets, services or providers.
- **Feature commit / pre-ledger HEAD:** `edb19643ba7c71fe4f6ca269fafd05db89cbcb6e` ([commit](https://github.com/georgealex55/agency-control-gateway/commit/edb19643ba7c71fe4f6ca269fafd05db89cbcb6e)). This ledger commit is the ending HEAD.
- **Files changed:** `.github/workflows/reach-2-2-shell-ci.yml`, this ledger. No shell HTML changed; no mirror sync required.
- **Executed evidence:** GitHub file creation succeeded and staging branch HEAD was read back at `edb1964`. Existing prior native Node/browser checks were NOT run in this execution. GitHub commit statuses returned an empty list at inspection; new Actions workflow outcome is UNVERIFIED, not PASS. Existing GitHub Actions run list showed unrelated Neon binding workflow history, not this shell gate.
- **Limitations:** no checked-out repository in the local runtime for native Node/browser tests; workflow must be allowed to run and its logs inspected. No database or real authentication touched.
- **Next:** ordinal 2 — server-side synthetic staging auth/session foundation; inspect this CI run and fix any failures before advancing if needed.

## Run 2 — 2026-11-12 UTC (staging)
- **Ordinal:** 2 from one completed ledger entry. **Starting HEAD:** `7c6e49b52056ad0f918af3c94aa5637570121ab6`. Prior REACH 2.1 report, Run 1 ledger, repository tree, current portal auth and new Node workflow inspected.
- **Milestone:** added a separate, testable staging-only synthetic owner authentication foundation at `reach-staging/auth/session.cjs`: per-password random salt with scrypt, constant-time password comparison, random 256-bit opaque session tokens stored as hashes in ephemeral process memory, fixed 8-hour expiration, revocation, tenant/user/owner role claims, CSRF token validation and Secure/HttpOnly/SameSite=Strict host-only cookie formatting. No login endpoint or persistent session backend is enabled; existing public demo credentials remain unrelated and NOT secure auth.
- **Files:** `reach-staging/auth/session.cjs`, `reach-staging/auth/session.test.cjs`, `.github/workflows/reach-2-2-shell-ci.yml`, this ledger. Shell HTML unchanged; mirror unchanged.
- **Commits:** feature `c088398c417a93db7709f1831fae0f763074ce51`, tests `562737b151d186b43d2febc5b54cf51a0ba498a5`, CI `782f6b09e2435c6ac0c8c18645309130b6bdd20d`; ledger commit is ending HEAD.
- **Test evidence:** three native Node test cases AUTHORED and wired to Node 22 GitHub Actions, **NOT EXECUTED in this tool runtime**. Previous Run 1 CI result not verified. No browser or live integration tests executed. GitHub file writes succeeded. No shell byte changes.
- **Limitations:** in-memory sessions are deliberately non-distributed; no HTTP route, account provisioning, Neon writes or production auth. Check Actions results and remedy failures before connecting auth to API.
- **Next:** ordinal 3 — tenant authorization deny-by-default at API/repository boundaries and cross-tenant tests.
