# REACH CRM — Fault-injection idempotency and encrypted SQLite restore

**Audit date:** November 4, 2026 (America/Vancouver)
**Candidate:** BAISESYSTEMS/GoHyperLevel@24ea786b85c3240ae4f24dcad6f657749730c56e
**REACH branch:** experiment/gohyperlevel-synthetic-poc-20261104
**Verified Docker fault + restore run:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41949014934
**Fault evidence:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41949014934/artifacts/13379767599
**Backup evidence:** see artifacts on the successful run (evidence JSON only; no archive or keys uploaded)
**Extended functional test run:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41949302259

## 1. Root problem: non-atomic workflow action and checkpoint

The pinned GoHyperLevel engine writes internal create_task and add_note actions as separate SQLite inserts. The workflow cursor checkpoint is saved later by the engine. A process crash after the insert but before the checkpoint can re-run the action after restart. The preexisting service-restart POC exercised old cursors without proving that this action/commit boundary could not duplicate its side effect.

### Minimal staging-only fix

The isolated REACH overlay adds a receipt table named reach_workflow_internal_receipts. For create_task and add_note only, it wraps the internal action write and receipt insert inside the same synchronous SQLite transaction. Receipt identity combines workflow run ID, position/cursor, and the persisted step ordinal. The next attempt after a crash checks the receipt and suppresses a duplicate local action. The receipt and local action commit atomically.

This overlay is strictly scoped to an immutable pinned candidate, applied in a disposable source checkout during CI, and is **not** merged upstream or into REACH production. It deliberately does not claim exactly-once semantics for external email, SMS, webhooks, payments or social publication.

### Full fault-injection tests against real Docker runtime

Four cases passed using separate synthetic Docker volumes, the actual GoHyperLevel production image and localhost-only service operations:

| Interruption point | Action | Result |
| --- | --- | --- |
| Before internal action | create_task | PASS |
| After internal action write before cursor checkpoint | create_task | PASS |
| Immediately after cursor checkpoint | create_task | PASS |
| After internal action write before cursor checkpoint | add_note | PASS |

The test hook is only injected into the synthetic QA image; it requests SIGKILL and includes an abrupt exit fallback to ensure the process is terminated. After each forced interruption, the app container is removed and a new one is started with the original Docker named volume. The real scheduler recovers the workflow, and a second container restart verifies persistence and no repeat side effects. Logs show **4 / 4 scenarios passed, exactly one internal task/note per case, zero duplicates**.

Earlier red CI attempts were test-harness trigger problems, not a demonstrated platform regression. The corrected end-to-end run above is green.

**Limitations:** This demonstrates atomic local SQLite actions in the tested cursor cases, not all possible workflow branches or long-running actions. The crash hook exits the process at a controlled test seam; it does not inject arbitrary host or disk corruption. External side effects remain at risk of duplicate delivery in their own acknowledgment/checkpoint window without provider-side idempotency, an outbox protocol or reconciliation.

## 2. Authenticated encrypted SQLite backup and restore: PASS

The backup test uses GoHyperLevel's real authenticated backup endpoint to generate a consistent SQLite snapshot via VACUUM INTO while the source service is running. The REACH helper seals the database snapshot, instance secret, and available data key/previous-key material in one **AES-256-GCM** encrypted envelope. A unique randomly generated passphrase derives the key using scrypt with random salt; a fresh random GCM nonce is used per archive.

The test verifies:
- The source snapshot is a consistent SQLite database and passes SQLite integrity_check.
- The encrypted archive round-trips correctly, and the exported temporary plaintext snapshot is removed after encryption succeeds.
- A wrong passphrase is rejected before restoration.
- A tampered ciphertext is rejected by GCM authentication.
- Authenticated content is checked for SQLite integrity and key tables before restoration.
- Restore occurs onto a **different empty Docker named volume**, carrying the database plus necessary instance secret/key material.
- The fresh GoHyperLevel service authenticates the original synthetic admin, keeps the same location and contact, resumes the saved waiting workflow after a due-date simulation, and creates one expected internal task with no duplicates.
- Another application restart retains the restored workflow and the one-task result.

The CI run passed. The encrypted archive itself and passphrase were not uploaded as artifacts. Only non-sensitive test metadata was uploaded. The temporary image and named volumes were removed on runner completion.

**Important distinction:** The application's operating pghl.db remains plaintext, as required by this upstream version. This stage adds an **encrypted off-volume backup package**, not transparent database encryption at rest, centralized key management, or an automated offsite backup rotation system. An archived secret is as sensitive as the database it unlocks; the passphrase needs separate managed storage in any production-grade design.

## 3. Files and reproducibility

- scripts/reach-workflow-idempotency-patch.mjs — atomic local workflow receipt overlay.
- scripts/reach-workflow-fault-injection-patch.mjs — synthetic-only fault hooks at action/checkpoint boundaries (never deployed).
- audit/gohyperlevel/reach-fault-phase.mjs — create fixtures, seed crashed runs, verify exact counts.
- scripts/reach-docker-fault-matrix.mjs — build, crash, replace and verify for four scenarios.
- audit/gohyperlevel/reach-backup-restore-phase.mjs — source API snapshot, due waiting workflow, restore readback.
- audit/gohyperlevel/reach-encrypted-backup.mjs — authenticated AES-GCM envelope and negative tamper/passphrase tests.
- scripts/reach-docker-encrypted-restore.mjs — two named Docker volumes and isolated encrypted restoration.
- .github/workflows/reach-fault-backup.yml — two independent CI jobs on the experiment branch.
- .github/workflows/gohyperlevel-poc.yml — main functional staging checks updated to apply the idempotency overlay and security overlay.

## 4. Release status and next gates

The targeted fault-injection and encrypted restore tests passed on the patched GoHyperLevel candidate.

Before any real customer access:
1. Confirm the updated full REACH functional/browser CI workflow passes with BOTH overlays.
2. Re-run the original broad upstream suite and classify earlier failures; the new tests do not resolve those independent regressions.
3. Add provider-specific idempotency keys, persistent outbox/reconciliation and manual review for ambiguous sends (email/SMS/webhooks/Postiz), with isolated fake transports first.
4. Test frequent encrypted backup schedule, offsite retention, KMS/passphrase separation, key rotation, backup corruption detection and recovery objectives.
5. Review AGPL-3.0 hosted modification requirements and production architecture.

**Safety:** All work is on the isolated REACH experiment branch. No production deploy, main merge, real GHL/Meta/Postiz accounts, external notification, or customer-data write occurred.
