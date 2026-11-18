# REACH personal Connections staging — audit and activation gates (2026-11-14)

## Scope and user selection
Staging branch only. Personal staging workspace; secure owner authentication; six services: Neon, Google, Facebook/Instagram, AI assistant, website and file storage. Permission model: propose external/consequential actions, require explicit owner approval; no real outbound actions enabled during this pass. Do not touch production or existing customer records.

## Verified infrastructure and code
- GitHub repository: georgealex55/agency-control-gateway, branch experiment/gohyperlevel-synthetic-poc-20261104. Prior three-run shell sprint passed native shell regression 43547431847; staging policy and platform build passed on 6c41b719.
- Vercel project agency-control-gateway exists; last inspected preview deployment for 6c41b719 was READY, target null (preview, not production). Readiness is not an end-to-end OAuth or browser acceptance test.
- Neon project agency-control-gateway exists (project red-tree-98955858); it has a production/default branch and historical staging branches. **No branch was created, migrated, or connected in this pass.** Never reuse production/default branch for personal tests.
- The shell Connections screen is an offline demo; it does not provide secure auth, real imports, credential storage or live health. The dummy login is not authentication.
- SOCIAL_META_CONNECTIONS_STAGE.md documents an existing server-side read-only Meta OAuth implementation with nonce, encrypted token storage, account selection, and staging feature flags, but explicitly says no live Meta account was connected. Reuse and test this implementation; do not create a competing browser token flow.
- Next.js package includes jose, @neondatabase/serverless, @vercel/blob and platform routes; this is not proof that Google, AI or storage credentials are configured.

## Implemented safe prerequisite
`ghl-gpt-gateway/lib/connections/personal-staging-readiness.cjs` is a fail-closed provider manifest for the six requested services, mapped to the five Connections sections. A provider is ready for a **read-only test** only after a verified owner session, exact personal-staging workspace and per-provider authorization gate. Even then it exposes no write/send/publish capability. `mayExecute` requires explicit approval and rejects outbound/write/send/publish actions. This is a local contract, **not yet connected to an authenticated HTTP endpoint or live provider**. Companion node:test coverage checks denial defaults, workspace isolation and permission restrictions.

## Authorization and activation checklist
1. **Secure owner login:** select and configure a server-side auth provider, verify owner session and CSRF protection, bind immutable workspace ID. Do not use the public demo password. Owner must authorize account creation/sign-in.
2. **Neon:** owner selects an isolated non-production branch (prefer empty personal test branch, not copied real customer records), confirms storage budget and migrations. Bind its connection URL as a staging-only server secret; verify tenant RLS and backups before any writes. No existing branch was altered.
3. **Google:** owner supplies a Google Cloud project/OAuth consent configuration and authorizes individually requested minimum read scopes for Gmail, Calendar and Business Profile (Business Profile API eligibility and consent must be verified). Register the exact preview callback origin; no tokens in localStorage.
4. **Meta:** owner supplies approved Meta developer app IDs/secrets, app/tester roles, verified HTTPS redirect and selected Page/Instagram Professional account. Use existing server-side OAuth path; keep `SOCIAL_META_CONNECTIONS_ENABLED=false` until authenticated staging tests and consent are approved. No publishing permissions.
5. **AI:** owner chooses provider/model and a cost cap; configure API key as a staging-only server secret. Test draft-only inference with synthetic content; no automatic customer messages.
6. **Website:** owner provides domain and verifies control; allowlisted HTTPS GET-only health/read checks, SSRF-safe host validation and request limits. No form submissions.
7. **File storage:** owner selects private customer-controlled bucket; grant least-privilege staging service identity, enforce tenant prefixes, encryption and retention; test only synthetic objects after explicit authorization.
8. **Connections UI:** wire server-side status endpoint and authorization callbacks into one Connections tab with five sections; show disconnected/pending/verified/expired and last check, without revealing tokens. Centralize setup controls; preserve legacy deep links.
9. **Acceptance:** secure login/logout, isolated workspace, OAuth state replay and callback mismatch, denial without approval, token revocation, failure/retry, import preview/rollback, mobile/keyboard behavior, no network sends, all CI green. Preview and manual browser testing remain pending.

## Next engineering work
Integrate manifest into authenticated, tenant-bound API and UI after choosing auth provider and isolated Neon branch. Never treat this static manifest as actual authorization. Review Google/Meta app consent, AI/provider billing and storage separately. No production merge, live dispatch, or real account mutation authorized.
