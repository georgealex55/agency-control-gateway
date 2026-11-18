# Social Intelligence — Meta readiness and private media staging

## Branch and boundaries

- Branch: `feature/social-meta-media-stage-20261029`, built from the Vercel-native queue branch.
- Neon isolated staging branch: `br-wispy-sea-b5vmedn0`; database `agency_platform`.
- Vercel branch-only preview variables: `AGENCY_PLATFORM_DATABASE_URL` and `SOCIAL_STAGING_ENABLED=true`. Original production branch, database and secrets are untouched.
- GHL scanning/imports and external social publishing remain disabled.

## Meta/Facebook and Instagram integration foundations

- `social-meta-contract.ts`: separate Facebook Pages and Instagram Professional login scopes, strict HTTPS redirect validation, explicit Graph API version, and OAuth authorization URL builders for future activation.
- `social-meta-graph.ts`: fixed Meta host, fixed GET-only identity request, bearer token server-side; tests are contract-level and no real Meta call is made.
- `GET /api/platform/social/meta/readiness?workspaceId=<uuid>`: admin-only read-only checklist, explicitly reports accounts not connected and OAuth launch disabled.
- `GET /api/platform/social/meta/callback`: fails closed with HTTP 423. The callback does not exchange codes or store tokens until consent, encrypted credential storage, replay protection, account selection and provider testing exist.
- Separate staging tables `agency_social_meta_connections` and `agency_social_meta_oauth_flows` provision future encrypted data and short-lived consent state; no tokens inserted.
- Real Facebook Pages OAuth and Instagram Professional Login require separate Meta Developer App configuration and appropriate permissions, testing, and App Review. No app secrets are stored in this repository.

## Private media library

- `agency_social_media` records workspace-owned image metadata, with private blob path stored only on server.
- `GET /api/platform/social/media?workspaceId=<uuid>` lists authenticated workspace media metadata; never returns a direct private blob URL.
- `POST /api/platform/social/media` is staged, admin-only and same-origin; disabled unless `SOCIAL_MEDIA_UPLOADS_ENABLED=true` plus a private Blob token are present. Accepts up to 4 MB JPEG, PNG and WebP files; verifies magic-byte signatures; rejects SVG and other formats.
- `GET /api/platform/social/media/:id/file?workspaceId=<uuid>` verifies authenticated workspace ownership before streaming a private Blob with no-store and nosniff headers.
- Media library tab includes an upload input and private previews, but cannot upload without an isolated private Vercel Blob store.
- Large video uploads will require client-direct uploads and provider-aware transcoding; not implemented.

## To enable staging media safely

1. Provision a **private** Vercel Blob store separately for staging. Do not attach it to production or share tokens with live client workflows.
2. Supply the private store token as `BLOB_READ_WRITE_TOKEN` scoped to the staging branch only.
3. Set `SOCIAL_MEDIA_UPLOADS_ENABLED=true` for that preview branch only after reviewing store permissions and costs.
4. Verify a synthetic PNG upload and authenticated private preview; verify a second workspace receives a 404 for the same media ID.
5. Verify 413/400 behavior for oversized or mismatched content, and ensure that no blob URL appears in the JSON list.

## Remaining blockers

- Staging administrator login needs `AGENCY_PORTAL_PASSWORD_SHA256` and `AGENCY_PORTAL_SESSION_SECRET` configured securely; never place passwords/secrets in Git or chat.
- Actual end-to-end Vercel Queue callback has not been tested using an authenticated preview. SQL state-machine tests and CI tests are not that end-to-end proof.
- Meta OAuth activation, per-workspace Page/account selection and encrypted token lifecycle, scope verification, token rotation, rate limits, platform app approvals and auditing remain future work.
- Do not promote to main or publish content without explicit approval and validated provider callbacks.
