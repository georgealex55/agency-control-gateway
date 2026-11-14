# REACH 2.0 — Customer-owned business command center (design draft)

Status: **design draft / staging only**. Not an implementation, production commitment, vendor capability certification, or approval to provision services. Updated 2026-11-06 UTC.

## Confirmed product decisions
- REACH is a **business operations / digital presence command center**, not a GHL-clone-first CRM. Unified owner dashboard covers business health, calls/messages, metrics and prioritized actions. Older CRM/funnel capabilities are secondary and can be reused rather than setting navigation.
- Target initial user: **one business owner** per independent installation. Independent deployment per business/customer; an **optional** future agency management portal must require explicitly scoped, revocable customer consent.
- Installation: a **guided wizard**. Customer supplies hosting, a dedicated Neon database/project, cloud object storage and their own AI API credentials. REACH does not host their production data in the developer's infrastructure.
- Phone: forward existing business calls to an AI receptionist through a customer-connected compatible telephony/voice provider. Caller consent/recording requirements and implementation vary by region and provider.
- AI automation: auto-reply and schedule appointments only **within configured rules**; escalation, audit trail, allowed business hours, budget and channel-specific controls required. No general autonomous editing of public profiles without separate approval.
- Account connections: single connection center with guided discovery, direct integrations and developer-supplied plugins.
- Plugin scope initially limited to **dashboard widgets and provider/integration adapters**. Only the developer installs or publishes plugins. Use explicit permission manifests and versioned, testable interfaces. Avoid arbitrary unreviewed code execution.
- Failure policy: durable queue for eligible actions, preserved history, retry/idempotency and **manual reconciliation of ambiguous external sends**. Never blindly re-send an ambiguous SMS, email or webhook.
- Delivery: core starter must cover website/Google presence monitoring, inbox/call coverage and useful metrics/action center—not just a marketing mockup.
- Billing: monthly software subscription, with infrastructure and third-party usage on customer accounts. Renewal/grace/outage/data-access rules remain undecided. Customer retains ownership of their data, files and service accounts.
- Updates: developer ships releases; automated security fixes subject to verified integrity/compatibility, while major product changes require owner approval. Rollback and backup verification needed.

## Proposed deployment boundaries
Each customer installation contains:
1. Responsive REACH web UI + API (customer-owned hosting account; Vercel is an option, not a mandatory vendor).
2. One customer-owned Neon PostgreSQL project for records, configuration, normalized observations, outbox and audit events. All records still scoped by business/location ID to avoid accidental mixing when customer has multiple locations.
3. Customer-owned S3-compatible or equivalent cloud object storage for large files, exported reports, permitted call recordings and backups; no large binary payloads stored in Neon by default.
4. Customer-managed provider credentials (AI, telephony, email/SMS, Google, calendars, website). Secrets encrypted/held server-side, no exposure to dashboard plugins or browser bundles.
5. A durable job runner/integration worker with explicit availability and retry guarantees; do **not** assume a serverless request alone can provide permanent real-time call handling or background job execution. Call media paths may require a provider-hosted voice service.
6. Optional, separately authorized agency support/maintenance capability; not a shared, implicit superuser or shared database.

## Core application modules and proposed entities
- **Business profile & source of truth:** `business`, `location`, `hours`, `service`, `contact_details`, `profile_change_proposal`; distinguish customer-entered authoritative values from observed third-party values.
- **Presence monitoring:** `connected_site`, `provider_connection`, `health_observation`, `listing_discrepancy`, `review`, `sync_checkpoint`. Read-only detection first; changes require permission according to risk.
- **Communications:** `conversation`, `message`, `call_session`, `customer_contact`, `callback_task`, `appointment`. Channel/provider capability gating; preserve source IDs and delivery state.
- **Metrics & actions:** `metric_observation` with source + measurement window, `alert`, `task`, `action_execution`, `automation_rule`, `approval`, `audit_event`. Show provenance, timestamp and freshness; don't fabricate unsupported metrics.
- **Resilient integration:** `outbox_action`, `provider_delivery_receipt`, `reconciliation_case` with idempotency keys and manual hold for ambiguous delivery status.
- **Developer extensibility:** `plugin_manifest`, `plugin_installation`, `widget_definition`, `capability_grant`, `plugin_release`. API and permission versioning with migrations.
- **Licensing & update metadata:** `license_status`, `release_channel`, `update_acknowledgement`, `backup_snapshot` (separate ownership from customer data access).

## Proposed boundary contracts
- Integration adapter: `manifest()`, `beginAuthorization()`, `completeAuthorization()`, `getConnectionHealth()`, `syncReadOnly()`, `handleVerifiedWebhook()`, `revoke()`; each capability optional/declared.
- Widget SDK: versioned manifest + bounded read-only dashboard data selectors + explicit user actions routed through authorized core APIs. No direct DB, secret or external-network access from third-party widgets by default.
- AI policy boundary: customer-provided AI provider credentials via encrypted server-side references; allowed intents, approved facts, human handoff, max auto-response scope, rate/cost ceiling, recording/transcript retention, action log. Appointment confirmation and customer-facing sends go through durable outbox.
- Data handling: per-business/installation authorization, short-lived delegated access, least privilege, capability-specific provider scopes, sanitized public diagnostics, backup and restore drills.
- Voice: customer-configured call forwarding to provider; provider webhook identity verification, business hours routes, human handoff and failure fallback. Do not assume real-time streaming support from all combinations of Vercel and AI providers.

## Guided first-time installation wizard (draft)
1. Owner account, business type/location, operating region and phone/website inventory.
2. Infrastructure preflight: verify deployment URL/HTTPS, server-side secrets capability, job scheduling/worker availability, webhook reachability; display any charges/free-tier caps.
3. Database: customer pastes restricted Neon connection secret or links supported account; validate project binding, run isolated role-aware migrations after explicit user consent, seed only synthetic/configuration data.
4. Object storage: connect customer bucket/keys, configure scoped access, uploads, expiration/retention and encrypted backup target, verify restore path.
5. AI: customer enters provider key, verifies allowed models/capabilities and sets automation/budget policies.
6. Communications: connect telephony provider and choose forwarding destination, fallback, calendar, messaging endpoints and opt-in policies.
7. Business presence: connect website, Google Business Profile and optional social accounts with smallest available scopes; choose master business data.
8. Dashboard priorities and alerts; simulation mode for a missed call, message, listing mismatch and appointment.
9. Activation checklist with connection tests, webhook challenge verification, data ownership summary, backup/export check and a reversible go-live action.

## Proposed dashboard / navigation
**Overview** (operating status, urgent attention, last sync) · **Inbox & Calls** (missed calls, conversations, callbacks, AI handoffs) · **Online Presence** (website, Google profile, listings, hours, reviews) · **Metrics** (source-labeled trends, response rate, bookings, website traffic and available Google metrics) · **Tasks & Automations** (alerts, approvals, queue, delivery reconciliation) · **Assistant** (read-only explanation + bounded actions) · **Connections** (providers, secrets, permissions, sync health) · **Settings & Updates** (license, backups, updates, authorized agency access). Contacts and sales pipeline stay contextual/secondary.

## Roadmap and acceptance gates
1. **Foundation & branch protection:** retain existing staging; create standalone modular shell and shared domain models without integrating unverified upstream SQLite/GoHyperLevel internals. Confirm tests and CI first.
2. **Owner installation & data:** reproducible customer-owned deployment template, Neon schema, object storage and onboarding preflight, test with disposable synthetic infrastructure; prove no cross-client credentials.
3. **Business status starter:** real website monitoring and first supported Google connection with clear capability constraints, synced observations, freshness, actionable discrepancies and daily dashboard. Never claim unsupported read/write API data.
4. **Communications starter:** supported inbound message provider, telephony forwarding adapter, simulated calls and missed-call flows, durable outbox with duplicate/ambiguous-send protection, owner alerts and history.
5. **Metrics + AI:** source-linked metrics with time windows, owner-configured AI replies/booking rules and handoff, budgets, prompt safeguards, schedules and recorded approvals. Validate with synthetic provider stubs before real opt-in integrations.
6. **Plugin SDK & releases:** developer-only signed/allowlisted widget+adapter release flow, permissions, upgrade/rollback, audit trails, repeatable test fixtures; optional customer-approved agency support portal.
7. **Starter release validation:** on a customer-owned isolated staging deployment, run end-to-end website/GBP observation -> alert -> owner action, inbound call/message -> AI or handoff -> appointment -> dashboard metric, plus provider outages and restore. No real provider sends without consent.

## Existing staging work to preserve, not misrepresent
- Client Neon config validation; authorized-client routing; authenticated pool registry; PostgreSQL migration adapter; read-only health and readiness probes; synthetic tests.
- Read-only contacts service and opportunity pipeline/stage-change prototype; both lack staging schema/HTTP endpoints/real database integration.
- Earlier synthetic workflow receipts, recovery, encrypted SQLite backups, outbox and provider reconciliation tests; keep as regression references, not as proof of production integrations.
- The pinned GoHyperLevel SQLite candidate remains **experimental source**, not the new product's architecture. Never merge staging into main or deploy without explicit authorization.

## Important open decisions
Precise first customer/vertical and location count, supported website/Google providers and verified APIs, selected call/AI/inbox stack, recording and consent handling, hosting/worker requirements, S3-style storage provider, permissions and contact resolution, dashboard scoring and KPI priority, license grace behavior, backup/retention, update rollout and plugin SDK trust model, first-release acceptance criteria. Gather these in next questionnaire. No services/provisioning/deployment authorized.
