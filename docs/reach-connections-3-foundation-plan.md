# REACH Connections 3.0 — approved architecture and phased build

Decision record (2026-11-23): 1D, 2D, 3B, 4D, 5D, 6D, 7D, 8D, 9D, 10D, 11A, 12D.

## Product boundary
Owner-facing page focuses on **connected accounts and honest health status**, not an extensive searchable marketplace. Only integrations with operational OAuth **or already-linked account records** appear, so an existing connection never disappears when reconnect is unavailable. Unsupported providers are not advertised as clickable. Full provider catalog remains developer documentation only.

Two authorization modes eventually: central REACH-managed OAuth for typical owners, and encrypted bring-your-own API credentials when individual adapters exist. Customer never sees platform Meta developer secrets; the single platform owner can reach a separate developer console. The existing single-owner cookie is **not** customer-specific authentication.

## Phase 1 — implement on this branch (preview, no prod writes)
- Connection health cards (provider, account, last verification, expiry, and action required) with a conservative **read-only SQL** snapshot endpoint. A recent database verification timestamp does **not** assert a real-time provider heartbeat.
- Existing Meta Connect/Verify/Disconnect remain in place and unchanged. No outbound/publishing or new OAuth permission request.
- Show only currently available connectors plus previously linked accounts. Show clear empty state; no simulated green connections.
- Put infrastructure-only Neon credential form inside the existing session-guarded developer console, not the customer Connections page. Preserve its APIs without changing stored credentials.
- Scope every read to an explicitly selected workspace. Production workspace allowlist and database RLS are already enforced server-side.
- Use failure/unknown status rather than false success if health cannot be read. No scheduled refresh, secret returns, or mutations by health GET.

## Phase 2 — identity and safe integration infrastructure (requires separate approval)
- Introduce real tenant identity with user invitations, workspace membership, roles, and server-enforced per-workspace authorization. The current portal session is **one platform owner only**, not a tenant access model.
- Provider adapter contracts, separate encrypted app and customer credential stores, inventory with per-account scopes, consent history, least-privilege grants, and authenticated audit trail.
- Connection lifecycle orchestrator for bounded retry, refresh/backoff, rotation, expiry and revocation, observability, and owner notifications. Never silently widen provider scopes.
- Policy engine: read-only vs recommend vs allowed routine operation, with per-customer approvals, restrictions, audit receipts and emergency disable. **Default off for writes**. No external actions without explicit approval.

## Phase 3 — first essential connectors, sequenced (requires provider onboarding)
1. Google Business Profile (reviews, listing status and metrics), Gmail/Workspace and Calendar (read-only initially) with business-owned OAuth and provider approval.
2. Microsoft 365/Outlook, custom IMAP/SMTP and Resend. Inbound/outbound email action scopes and address/domain verification remain off until separately approved.
3. Twilio + existing number forwarding and optional additional phone providers; call transcription, consent, SMS opt-out, emergency handling, rate budgets and AI receptionist policies required before activation.
4. Website/domain/DNS read-only monitoring, WordPress, Shopify, custom websites and APIs; full validation before customer keys or automated changes.

## Phase 4 — subsequent integrations
AI provider keys (customer-specific vaulted keys and budgets), Stripe/payment reporting, optional social platforms (LinkedIn, TikTok, YouTube, Threads, etc.) once each adapter is actually operational. Only then expose those connectors as available. Billing and money movement stay disabled without separate approval.

## Acceptance and non-goals
- No Instagram Unified Login configuration or reactivation; existing Meta flows preserved.
- No new database tables, migrations, credentials, env vars, platform/customer authorizations, publishing, messaging, phone calls, payments, webhook subscriptions, or live external actions in Phase 1.
- Selected workspace isolation, conservative state classification, no secret leaks, responsive layouts, keyboard focus and failure states tested in CI.
- Browser Preview may have no approved customer database and must show an honest setup/empty state rather than fabricated connections.
- Production unchanged; build and Preview only until separately authorized.
