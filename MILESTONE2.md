# Agency Control — Milestone 2: Independent Platform Core

## Scope and change in roadmap

Build the replacement platform FIRST. GoHighLevel remains a legacy integration and will only be used during the FINAL migration phase, after the independent website, LMS, CRM, scheduling and social modules are tested. This milestone does not use the GHL SDK/OAuth credentials and does not import any client records.

## Delivered architecture

- One existing Next.js app, `ghl-gpt-gateway`, with a new Workspaces view under the existing Agency Control homepage.
- Dedicated Neon database `agency_platform` in the existing Agency Control Neon project, with a dedicated PostgreSQL role.
- `AGENCY_PLATFORM_DATABASE_URL` configured as a sensitive Vercel environment variable for preview/production/development; never commit the connection string.
- Server-side workspace management endpoints:
  - `GET /api/platform/workspaces`: administrator-only list of platform workspaces and module plans.
  - `POST /api/platform/workspaces`: administrator-only creation of a native workspace.
  - `PUT /api/platform/workspaces/:id/modules`: administrator-only planning of modules as hidden/planned. Does **not** grant client access.
- Database tables:
  - `agency_platform_workspaces`: real native accounts, UUID ID, unique slug and business type.
  - `agency_platform_module_plans`: agency's persistent plan for each module.
  - `agency_platform_audit_events`: action audit records.
  - `agency_platform_domains`: domain registry foundation, NOT DNS verification or publishing.
  - `agency_platform_memberships`: future identity role mapping, NOT active client login.
- Platform input validators and regression tests.

## Security boundaries

- All platform data APIs require an existing signed agency administrator session.
- POST/PUT enforce same-origin request validation.
- User input is validated; SQL parameters are bound, not interpolated.
- Writes and access are fail-closed when platform database or administrator login is unavailable.
- No Stripe integration, customer billing, email/SMS sends, publishing, domain cutovers or feature activation.
- No client-facing identities yet; the platform is single-agency-administrator only.
- No GHL connection is required for creating or planning native workspaces.
- The original GHL API routes remain intact to avoid breaking existing automation but are no longer part of core navigation.

## Operator setup

The main agency dashboard requires two existing environment variables which were not automatically provisioned:

- `AGENCY_PORTAL_PASSWORD_SHA256`: SHA-256 hash of a strong secret administrator password.
- `AGENCY_PORTAL_SESSION_SECRET`: a separate random string of at least 32 characters.

Configure them directly in Vercel's environment-variable interface. Do NOT commit them in Git, send them into chat, or reuse existing GHL tokens. Apply authentication rate limiting and/or Vercel Deployment Protection before opening login to customers. Current admin authentication is provisional; durable OIDC-based customer identities come next.

## Acceptance requirements

- Node 22 policy/validation tests pass.
- Next.js Vercel preview builds, with existing OAuth, MCP and API routes preserved.
- Separate Neon database contains only platform tables; read/write permissions for `agency_platform_owner` verified.
- Administrator cannot access APIs without valid session.
- Feature plans are `hidden` or `planned`, never client-access enabled.
- GHL integration not required, called or changed for platform CRUD.

## Next essential milestones

1. **Identity & billing**: replace provisional admin login with a managed OIDC identity provider; invite clients, enforce role-based access and tenant scoping; Stripe test-mode feature activation.
2. **Websites & domains**: connect Frappe Builder (or an independently validated alternative) to native workspace IDs; provision custom domains and preview/publish workflow.
3. **LMS**: connect Frappe Learning with instructors, students, progress and content storage.
4. **CRM & appointments**: independent contact, pipeline, calendar and lead automations.
5. **Social Intelligence**: Postiz or supported social API service with tenant-specific credential isolation.
6. **Last — GHL migration**: read-only agency inventory, compare datasets, migration tests, opt-in cutover and rollback.
