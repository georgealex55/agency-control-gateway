# Postiz Staging — first social backend integration

The complete **pinned** upstream Postiz source lives in `services/sources/postiz`. It retains the original app's repository layout, Docker instructions, and AGPL-3.0 license; it is not copied into the Next.js Vercel app.

## External staging runtime required

Do **not** deploy Postiz to the Agency Control Vercel project. Use a dedicated Docker-capable development host. From the repository root, after running `bash scripts/checkout-upstreams.sh`:

1. Inspect `services/sources/postiz/docker-compose.yaml` and the matching deployment instructions from the pinned commit.
2. Provide unique staging-only credentials and persistent storage for Postiz's PostgreSQL, Redis, Temporal/workers, and media assets.
3. Run the upstream Compose services on the staging host. Use a public HTTPS hostname with TLS for the server-to-server API.
4. Create a **synthetic staging Postiz organization**, without connecting actual clients or real social channels.
5. In that Postiz organization, generate an API key and confirm `GET /api/public/v1/me` returns the correct organization ID.
6. Configure four *branch-scoped preview* Vercel environment variables:
   - `SOCIAL_POSTIZ_BASE_URL` — HTTPS server origin (root only)
   - `SOCIAL_POSTIZ_API_KEY` — sensitive secret, never publish in Git or browser
   - `SOCIAL_POSTIZ_ORG_ID` — expected organization from `/me`
   - `SOCIAL_POSTIZ_WORKSPACE_ID` — the staging Agency Control workspace UUID
7. Run `node scripts/verify-postiz-readonly.mjs` from a trusted operator environment with those four env vars to confirm the read-only upstream API.
8. The staging Social Intelligence interface now shows *only* the connected staging organization's channels and optional real analytics (which may be missing if no social accounts have been connected).

**No Postiz server or social platform integration has been provisioned by the present milestone.** The CI adapter tests use mocked HTTP responses and must not be mistaken for end-to-end social publishing verification.

## Isolation guardrails

- Social posts remain in the separate `social-intelligence-staging-20261029` Neon branch and can be drafted/planned/approved internally.
- Admin-only API access; server checks workspace UUID on each update/delete, and verifies Postiz organization identity on every read.
- Postiz outbound operations are **GET only**. There is no write/post/publish endpoint or scheduled dispatcher.
- Never reuse one tenant's Postiz API key or organization mapping for a different client's workspace.
- Retain GHL scanning, OAuth import and migration for a later final development phase.
- Before client-facing launch, replace the provisional admin login with OIDC, add rate limiting, private hostname/route hardening, per-tenant vault credentials, and server-enforced billing entitlements.
