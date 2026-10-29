# Unified Agency Platform — upstream service layout

This repository preserves the original Next.js application in `ghl-gpt-gateway/`. Third-party source checkouts live under `services/sources/` as **pinned Git submodules**, preserving each upstream repository's native directory and license layout. Sources are not copied into the Next.js application or executed on Vercel.

## Source checkout

```sh
git clone --recurse-submodules https://github.com/georgealex55/agency-control-gateway.git
cd agency-control-gateway
bash scripts/checkout-upstreams.sh
```

**Important:** submodule checkouts are opt-in (update=none) to keep Vercel builds fast. Run the checkout script to download full source before installing services. GitHub's standard ZIP download does not contain submodule source files. Use a recursive Git checkout. GitHub shows each entry as a source link pinned to its specific commit. `services/UPSTREAM_LOCK.json` is the source-of-truth inventory. Updates require explicit dependency review and a new gitlink commit; never track moving `main` branches in production.

## Architecture

```text
agency-control-gateway/                    (main GitHub repository)
├─ ghl-gpt-gateway/                         Next.js agency/control-plane app (Vercel)
│  ├─ app/                                  existing portal pages + API routes
│  ├─ lib/                                  auth, tenant, billing & adapters
│  └─ package.json
├─ services/
│  ├─ UPSTREAM_LOCK.json                    pinned commits and licenses
│  └─ sources/                              upstream source checkouts (not Vercel services)
│     ├─ frappe/                             Frappe v16 framework
│     ├─ builder/                            Frappe Builder app
│     ├─ crm/                                Frappe CRM app
│     ├─ lms/                                Frappe Learning app, v16 line
│     ├─ payments/                           Frappe Payments app
│     ├─ frappe_docker/                      Frappe container recipes
│     ├─ postiz/                             Postiz scheduling/analytics service
│     └─ activepieces/                       Activepieces automation (future phase)
├─ scripts/verify-sources.mjs               pin and checkout checks
└─ tests/
```

## Runtime boundaries

| Product module | Backend sources | Runtime | Status |
|---|---|---|---|
| Website Studio | Frappe, Builder | Python/Frappe, MariaDB, Redis, workers | Source pinned; integration pending |
| Learning Studio | Frappe, LMS, Payments | Frappe service; file/media storage | Source pinned; integration pending |
| CRM & scheduling | Frappe, CRM | Frappe service | Source pinned; integration pending |
| Social Intelligence | Native Vercel service; Postiz retained as reference | Next.js Functions, Vercel Queues, Neon PostgreSQL | Dry-run staging only; no social publishing |
| Workflow Studio | Activepieces | Separate application and worker stack | Source pinned; **deferred** |
| Agency Admin | Next.js + dedicated Neon DB | Vercel | Existing independent platform core |

**Frappe version constraints:** Frappe v16, CRM `main`, Learning `version-16`, Payments `version-16`, and a pinned Builder revision are the intended starting point. Compatibility must be verified on one dedicated test bench (frontend route collisions, permissions, migrations, app dependencies). Do not claim co-installation works until a test bench passes.

**Postiz:** Its own application/database/queue and user integrations are required; the source code alone does not enable scheduling or obtain external platform permissions. Postiz is AGPL-3.0, so honor obligations when modifying and network-serving the app.

**Activepieces:** The upstream root license covers community parts; enterprise directories have additional license restrictions. Do not deploy enterprise-only source or advertise white-label embedded builders without verifying entitlements.

**Frappe and Postiz cannot run inside the existing Vercel Next.js deployment.** The control-plane will use authenticated, tenant-scoped server-to-server adapters. The Next.js app is not a reverse proxy for arbitrary client-supplied URLs.

## Development stages

1. Maintain native workspaces, agency login and module planning (current Milestone 2).
2. Verify Frappe services on isolated container/Frappe bench, with a test workspace only.
3. Add Website Studio, then course authoring, then CRM and appointments, then social scheduler and reporting.
4. Add client SSO, server-side role scopes, metering, and agency-controlled paid entitlements before granting customer access.
5. Add workflow automation and agent templates after email, rate limits and social provider permissions are tested.
6. **Last:** GHL read-only inventory, import mapping, migration rehearsal, client cutover and rollback.

No GHL account connection, subaccount import, DNS cutover or client billing is part of these source checkouts.

## Licensing / source attribution

The complete upstream LICENSE or license.txt file remains within each recursive submodule checkout, along with its full source and build metadata. `services/UPSTREAM_LOCK.json` records source repositories and immutable revisions. Frappe Framework, Builder and Frappe Docker have their respective upstream licenses; Frappe CRM, Learning and Postiz are AGPL-3.0. Activepieces contains mixed licensed components. Review final distribution and service-use implications before a commercial launch.
