# REACH CRM — Synthetic transactional outbox and delivery reconciliation

**Local audit date:** November 4, 2026 (America/Vancouver)
**Experiment branch:** experiment/gohyperlevel-synthetic-poc-20261104
**Immutable candidate:** BAISESYSTEMS/GoHyperLevel@24ea786b85c3240ae4f24dcad6f657749730c56e
**Previously verified main branch:** a745db200febb8cf752dad0dea9502d69451c7de

**Initial successful integration:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41950865657
**Initial synthetic evidence:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41950865657/artifacts/13381510294
**Expanded verification (SUCCESS):** https://github.com/georgealex55/agency-control-gateway/actions/runs/41951402760
**Expanded evidence artifact:** https://github.com/georgealex55/agency-control-gateway/actions/runs/41951402760/artifacts/13381127821
**Expanded outcome:** 7/7 synthetic provider-worker crash cases passed, 4/4 unsafe outbound targets rejected, zero fake duplicate deliveries, two unreconcilable actions moved to review_required, and the actual app-process crash recovered one queued intent without duplication. TypeScript checks and the Docker job passed.

## 1. Purpose and strict isolation

The aim is to verify the workflow boundary between GoHyperLevel and providers during unclean shutdown and missing acknowledgments. The code **does not connect to real email, SMS, webhook or Postiz providers**. A fake provider stores acknowledgments in a second SQLite database on an independent temporary Docker named volume. Both the GoHyperLevel service and fake worker are started with Docker network=none, no published host ports and unique synthetic credentials.

The outbox intercepts original workflow step types send_email, send_sms, webhook and social_post when the synthetic-only overlay is installed. It never calls the original network transport. A dedicated environment flag is required and all inputs must use @example.invalid email recipients, reserved test phone numbers, .invalid webhook hosts or reach-fake-postiz-* integration IDs. A missing flag or an unsafe address throws before any outbox write.

The scope is strictly limited to synthetic staging. There is **no real provider implementation** and nothing has been merged to production or the upstream project.

## 2. Storage and state machines

The staging-only outbox adds a SQLite table reach_synthetic_outbox and creates a durable intent for each workflow execution. Each intent stores its workflow run ID, client location ID, step ID, cursor+step ordinal, channel, payload hash, derived SHA-256 idempotency key and status.

The unique constraint on run ID plus execution key and the deterministic idempotency key make re-execution of the same step after a crash before the GoHyperLevel checkpoint return the original intent. The SQLite insertion is transactional. Note that the source engine still saves its workflow checkpoint separately; deduplication of the queued intent protects this specific gap. This is not a general atomic transaction spanning all CRM changes.

The fake worker uses compare-and-set claiming to change an intent from pending to sending, then records a fake provider acceptance in a *separate* SQLite database. The fake ledger enforces idempotency keys when enabled and supports optional receipt lookup.

- pending: action is durably queued and not yet claimed.
- sending: claim was persisted; outcome may be uncertain if the worker stops.
- delivered: acceptance confirmed, local acknowledgment recorded; additional reconciliation is a no-op.
- review_required: acceptance cannot be established safely and the fake provider cannot guarantee deduplication. The worker **does not automatically retry**.

If an acknowledgment is lost and a provider receipt can be found by key, the worker marks the existing intent delivered without sending again. If a provider supports a reliable idempotency key but not lookup, a retry with the **same key** can safely recover. If neither is supported, the intent stays review_required for a human to reconcile.

These are simulated provider guarantees; no assumption is made that real email, SMS, webhook receivers or Postiz provide the same contract.

## 3. Tests and evidence

The first green Docker run tested six intentionally interrupted worker deliveries:

| Scenario | Expected safe recovery | Initial result |
| --- | --- | --- |
| Email worker exits after claim, before fake provider accepts | One eventual acceptance | PASS |
| SMS worker exits after fake provider accepts, before local ACK | Receipt lookup, no second acceptance | PASS |
| Webhook worker exits after fake provider accepts, before local ACK | Receipt lookup, no second acceptance | PASS |
| Postiz worker exits after fake provider accepts, before local ACK | Receipt lookup, no second acceptance | PASS |
| Webhook with no reliable provider key or lookup | review_required; no automatic retry | PASS |
| Postiz with no reliable provider key or lookup | review_required; no automatic retry | PASS |

The suite also killed the actual GoHyperLevel app process **after the outbox row was committed but before the workflow checkpoint**, destroyed its container, mounted the same data volume on a replacement container, aged the stale run's checkpoint and verified that the real scheduler completed it while retaining **exactly one queued external intent**. The fake worker delivered that queued email once. Another service restart retained the single intent and acceptance.

**First successful run:** six worker crash tests PASS, one application crash recovery PASS, zero fake provider duplicates, and two intentionally unresolved states held for manual review.

The **expanded verification run succeeded** and added:
1. An email provider with idempotency-key enforcement but **without receipt lookup**. After simulated acknowledgment loss, retrying with the original key produced one accepted fake provider receipt, zero duplicates.
2. Four negative target guards (real-looking email, phone, webhook host and Postiz integration ID). All four workflows failed closed and wrote zero outbound intents. No real delivery occurred.
3. The original six provider cases and the real app-service after-enqueue crash test all passed again. **Totals: seven worker crash cases passed, four unsafe targets rejected, zero duplicates, two review_required cases.**

## 4. Committed staging files

- audit/gohyperlevel/reach-synthetic-outbox.ts — synthetic durable outbox and target validation.
- scripts/reach-synthetic-outbox-patch.mjs — source-pinned synthetic hook into the original workflow engine, never deployed.
- audit/gohyperlevel/reach-fake-provider-worker.mjs — independent fake provider ledger, worker crash simulation, dedupe and manual-review rules.
- audit/gohyperlevel/reach-outbox-fixture.mjs — synthetic contacts, real workflow API operations, restart assertions and unsafe target tests.
- scripts/reach-synthetic-outbox-ci.mjs — build isolated Docker image, test fake provider crashes and actual application SIGKILL/recovery, clean up both named volumes.
- .github/workflows/reach-synthetic-outbox.yml — reproducible CI gate on experiment branch only.

## 5. Production boundaries and engineering gaps

This is a **proof-of-concept and automated staging regression gate**, not an operational outbound delivery service. The outbox payload is plaintext in the temporary application SQLite file. A production-ready implementation needs encryption or minimized/sealed PII, retention policies, access controls, worker metrics, dead-letter/manual review UI, key management, and regular backup coverage.

Real providers require contract-by-contract validation:
- Email: verify the selected ESP supports a stable send idempotency key or reliable message-level reconciliation. Do not infer exactly-once from RFC Message-ID alone.
- SMS: investigate provider SID availability and retrieval after a lost HTTP response; stop for human review if unresolvable.
- Webhook: attach a signed deduplication key but assume receivers might ignore it; without receiver-level dedupe or lookup, uncertain delivery must not be repeated automatically.
- Postiz: verify the connected Postiz version and API's actual post-creation idempotency/reconciliation semantics before enabling any automatic retry of publishing.
- Avoid silent retry or false delivered status after uncertain acceptance. Persist and expose manual-review operations separately before production.

Other upstream full-suite failures previously discovered are outside this narrowed test. The full upstream suite has not been requalified by this work.

**Safety:** All GitHub writes are on the experiment branch. No main merge, production Vercel/Neon write, real GHL account, Meta integration, Postiz connection, outbound network call, customer data or production credentials were used.
