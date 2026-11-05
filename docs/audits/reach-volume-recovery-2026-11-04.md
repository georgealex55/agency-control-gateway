# REACH CRM — Exhaustive client isolation and Docker volume recovery

**Audit date:** November 4, 2026 (Vancouver)
**Pinned candidate:** BAISESYSTEMS/GoHyperLevel SHA 24ea786b85c3240ae4f24dcad6f657749730c56e
**REACH experiment branch:** experiment/gohyperlevel-synthetic-poc-20261104
**Main branch verified unchanged:** a745db200febb8cf752dad0dea9502d69451c7de

## 1. Exhaustive tenant and MCP sweep: PASS

[Source GitHub Actions run](https://github.com/georgealex55/agency-control-gateway/actions/runs/41942109566)

| Original upstream suite | Result |
| --- | --- |
| tests/tenant-isolation.test.ts | 11 / 11 passed |
| tests/mcp-sweep.test.ts | 13 / 13 passed |
| Combined | 24 / 24 passed |

Coverage includes member sessions across admin and location routes, API keys, mobile-device tokens, cross-tenant record IDs and natural keys, and synthetic client isolation. The MCP tool-catalog tests cover foreign tenant IDs, tool contracts, invalid and valid arguments, read-only key handling, and absence of unexpected writes. Tests ran with the previously verified REACH member-bound API-key masking patch, so no new fix was necessary in these suites.

## 2. Actual Docker service kill, replacement and state recovery: PASS

[GitHub Actions run](https://github.com/georgealex55/agency-control-gateway/actions/runs/41945449927)

[Synthetic recovery evidence artifact](https://github.com/georgealex55/agency-control-gateway/actions/runs/41945449927/artifacts/13378805609)

This is a runtime integration test against the actual upstream Docker production image (with the already verified restricted-key patch), not an in-memory workflow unit test.

The disposable test service started with a newly created Docker **named volume mounted at /data**, no Docker network access, no published host ports, random synthetic admin credentials and no real customer or provider configuration. Using authenticated REST routes, the test created two synthetic contacts and two internal-only workflows (add_tag, wait, create_task), confirmed each run was waiting with a persisted cursor pointing to the next step, confirmed both original tags were stored, and verified zero tasks were present.

The test then sent **SIGKILL** to the app container, removed it, and verified the named SQLite volume was still present. While no server was running, an offline one-off container opened that same volume: the first run's wait deadline was made due; the second was marked stale-running with its previously saved cursor retained. The image was launched as an entirely new application container with the same persistent volume.

The real scheduler then recovered both workflow runs and created one internal task per workflow. REST and SQLite readbacks confirmed that customer and workflow IDs were preserved and the initial tags remained intact. A further graceful restart of the replacement application reconfirmed that no duplicate task was created.

| Verified result | Outcome |
| --- | --- |
| SIGKILL and delete original service | Passed |
| Named SQLite volume survives removal | Passed |
| Start replacement app against same data | Passed |
| Due wait resumed | Passed |
| Stale running checkpoint resumed | Passed |
| Both workflow runs completed | 2 / 2 |
| Internal tasks | 2 expected |
| Duplicate tasks | 0 |
| Second service restart retains results | Passed |
| No external network access or customer accounts | Passed |
| GitHub Actions job | SUCCESS |

## 3. Files committed to the isolated experiment branch

- .github/workflows/reach-security-sweep.yml — tenant and MCP full-suite verification
- .github/workflows/reach-persistent-recovery.yml — actual Docker named-volume recovery pipeline
- scripts/reach-docker-persistent-recovery.mjs — Docker build, unique mounted volume, hard kill, replacement, second restart, cleanup
- audit/gohyperlevel/reach-volume-recovery-phase.mjs — synthetic API fixture, offline SQLite state transitions, verification
- scripts/reach-security-patch.mjs — pre-existing restricted member-bound key fix, applied only to disposable checkouts

## 4. Limitations and outstanding release gates

The named volume persisted **across service and container replacement on one host**. The GitHub Actions runner was ephemeral and the dedicated volume was removed after the successful test. This does **not** prove survival of the underlying host's storage loss, offsite disaster recovery, continuous staging availability or a durable multi-host database.

The stale running state was injected offline after an actual service crash. This checks the real scheduler recovery path but is not arbitrary instruction-level fault injection during a running action. Exactly-once delivery of external SMS, email, payment, webhook or Postiz actions was not tested; **all workflows were deliberately internal-only**. No external service account was attached.

Earlier failures of the larger original GoHyperLevel upstream test suite remain open and must be independently classified; this audit does not imply all upstream failures were fixed. The member-bound API-key bypass was corrected in the REACH experiment only, not in the upstream project or in production. Unbound and agency API keys retain broad privileges by design.

Recommended remaining work: complete the original full-suite regression and diagnose date/birthday workflow catch-up; introduce fault injection around checkpoint and external-send boundaries; test encrypted backup and restore on an independently persistent staging host; define key issuance, rotation and audit policies; review AGPL-3.0 obligations before hosted production changes.

**Safety state:** No live customer records, GHL accounts, Meta accounts, Postiz integrations, production Neon data, Vercel production deployment, or main branch were changed.
