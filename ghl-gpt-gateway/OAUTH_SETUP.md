# HighLevel Agency → Location OAuth

The gateway uses a two-level authentication model:

1. The Agency Private Integration Token remains available for agency-level discovery such as listing locations.
2. A HighLevel Marketplace OAuth installation stores the Agency/Company access + refresh session securely.
3. The Marketplace app is **Sub-account targeted**, installed by the Agency with bulk installation enabled.
4. For installed sub-accounts, the gateway exchanges the stored Company token for a Location token.
5. Location OAuth sessions are stored durably and refreshed by the official HighLevel SDK.

This avoids manually creating a Private Integration inside every sub-account.

## Required environment variables

Existing gateway variables:

```
GHL_PRIVATE_INTEGRATION_TOKEN=<Agency PIT>
GATEWAY_API_KEY=<gateway secret>
GHL_COMPANY_ID=<HighLevel company ID>
GHL_API_BASE=https://services.leadconnectorhq.com
ALLOW_DESTRUCTIVE_ACTIONS=false
```

Marketplace OAuth:

```
GHL_OAUTH_CLIENT_ID=<Marketplace App Client ID>
GHL_OAUTH_CLIENT_SECRET=<Marketplace App Client Secret>
GHL_OAUTH_REDIRECT_URI=<exact registered callback URL>
```

Durable OAuth storage:

```
GHL_OAUTH_DATABASE_URL=<Neon Postgres connection string>
GHL_TOKEN_ENCRYPTION_KEY=<32-byte encryption key, 64 hex chars or base64>
```

`DATABASE_URL` may be used instead of `GHL_OAUTH_DATABASE_URL`, but the dedicated variable is preferred.

## Marketplace app configuration

Use:

- Target User: **Sub-account**
- Installer: **Agency**
- Bulk installation: **enabled**
- Redirect URL: exactly the same URL configured in `GHL_OAUTH_REDIRECT_URI`

For Preview testing, use the stable Preview branch alias. Before production promotion, switch both HighLevel and Vercel to the production callback URL.

## Storage design

OAuth sessions are stored in Postgres table:

```
ghl_oauth_sessions
```

Each complete token payload is encrypted with AES-256-GCM before it is written to Postgres. The encryption key remains only in the deployment environment. The table is created automatically when storage initializes.

## Bootstrap sequence

1. Configure OAuth + durable storage variables in Vercel Preview.
2. Deploy `ghl-sdk-integration`.
3. Confirm `GET /api/oauth/status` reports OAuth and durable storage configured.
4. Install/reinstall the Marketplace app from its Installation URL.
5. HighLevel redirects to `/api/oauth/callback?code=...`.
6. The callback exchanges the code and stores the Company access + refresh session encrypted.
7. Confirm `agencySessionStored: true` and `locationOAuthReady: true`.
8. Generate/verify a Location session with `POST /api/oauth/location-session`.
9. Run `GET /api/ghl/read-validation`.
10. Run `POST /api/ghl/write-validation` for the non-mutating invalid-payload write-scope preflight.

## Location token generation

```
Company OAuth session
        ↓
POST /oauth/locationToken
        ↓
Location access + refresh token
        ↓
Encrypted durable session
        ↓
Official HighLevel SDK request
```

The protected Location diagnostic never returns access or refresh tokens.

## Current routing

Agency PIT:
- `list_locations`
- other explicitly allowlisted agency-level PIT operations

Durable Location OAuth:
- workflows
- funnels/pages
- blogs
- Social Planner
- migrated location-scoped write actions

Destructive actions remain behind the double guard:

```
ALLOW_DESTRUCTIVE_ACTIONS=true
confirmDestructive=true
```

## Production promotion checklist

Promote only after:

1. durable OAuth storage is configured,
2. the Company OAuth installation is stored,
3. a Location token has been generated,
4. read validation passes,
5. write-scope preflight passes,
6. build/CI passes,
7. production OAuth redirect settings are updated.
