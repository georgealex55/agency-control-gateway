# Social Intelligence — Private storage and Meta consent security

## Resource inventory

- Agency Control source branch: `feature/social-private-blob-security-20261029`.
- Neon staging branch: `br-mute-wind-b54k3fr5` (isolated copy; production unchanged).
- Private Vercel Blob store: `agency-social-staging-private` (`store_gzljSQEomfAWWROP`), region `iad1`.
- Blob store was created **at the Vercel team level, not connected to the existing application project**. No Blob token has been requested, copied, exposed, or added to the production project.
- Staging-only Vercel environment variables: `AGENCY_PLATFORM_DATABASE_URL`, `SOCIAL_STAGING_ENABLED=true`, `SOCIAL_MEDIA_STAGING_STORE_ID=store_gzljSQEomfAWWROP`, and `SOCIAL_MEDIA_UPLOADS_ENABLED=false`.

## Storage security and connection requirements

The app only permits media uploads when **all** these conditions are true:

1. Existing administrator session and same-origin validation succeed; the Social Intelligence API stage check permits this exact preview branch.
2. `SOCIAL_MEDIA_UPLOADS_ENABLED=true` on the staging branch.
3. `BLOB_STORE_ID` exactly matches `SOCIAL_MEDIA_STAGING_STORE_ID`.
4. Either a valid project-scoped `VERCEL_OIDC_TOKEN` (preferred) or an explicitly configured `BLOB_READ_WRITE_TOKEN` is present.

No upload can occur until the store is connected to the appropriate preview. A store existing at team level is not proof of usable Blob access.

The installed Vercel connector supports creating and inspecting stores, **but not linking a Blob store exclusively to a Git-branch preview**. Do **not** attach this store globally to the production Agency Control project without a scope review. To finish linking it, open the private Blob store in Vercel Storage and use its Projects connection settings, verifying that deployment/environment access is appropriate. If a project-wide connection is unavoidable, prefer a dedicated staging Vercel project using the same repository instead of granting production access.

For private Blob auth, Vercel's OIDC flow uses `BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN`; this is preferable to copying a long-lived secret. The storage status API surfaces only connection mode and capability flags (never tokens or private blob paths).

## Media safeguards

- JPEG, PNG and WebP only; max 4 MiB; signature inspection and declared MIME validation.
- Verify workspace exists before upload; list/read routes check workspace ID and signed administrator session.
- Upload with `access:"private"`, then persist only private pathname in PostgreSQL. API outputs omit the private pathname and origin.
- Private reads use the Blob SDK with no-store, nosniff and restrictive Content Security Policy. No public Blob URL or download link is returned.
- Failed database insertion attempts to clean up the staged object.
- Staging file upload and read need actual end-to-end tests **after** Blob access is linked.

## Meta consent and discovery foundation

- AES-256-GCM encrypted token envelopes bind ciphertext to exact workspace, provider, and account ID. Cross-workspace or provider decryption fails.
- HMAC-SHA256 consent-state signatures expire and cannot be altered without detection. The current helper is not yet an active OAuth handler; replay prevention also requires atomic consumption of a stored one-time nonce.
- `listFacebookPages()` performs a strictly fixed-host GET against Meta's `/me/accounts`, limits results to 25 Pages, refuses redirects, ignores external pagination URLs and **never** returns Page access tokens.
- Tests use synthetic tokens and stubbed HTTP only. No real Facebook or Instagram account is authorized or discovered.
- Meta OAuth callback remains disabled with HTTP 423. Any future live connection requires Meta developer app setup, correct provider app review, OAuth exchange, encrypted credential persistence and rotation, consent/nonce handling, and read-only account selection.

## Test and release boundaries

- Tests: `tests/social-private-storage.test.mjs`, `tests/social-meta-pages.test.mjs`, prior Social Studio regression suite.
- Build: GitHub Actions Next.js compiler and Vercel preview.
- This preview must **not** publish to social networks, charge anyone, send messages, scan GHL, or merge into main.
- Administrator credentials are not available in staging, so full authenticated UI flows remain untested until the user configures a strong password hash and signing secret via Vercel settings.
