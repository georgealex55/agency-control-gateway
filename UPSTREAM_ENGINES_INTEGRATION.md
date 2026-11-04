# Agency Control — Five Original Engine Integration (single-admin staging)

## Decision and status

Integrate the original upstream **application engines**, not just duplicate their features in Next.js. Their complete source remains pinned as Git submodules with original copyright/license files:

- Frappe Framework: `frappe/frappe@2fcb9397a1f1da353b21e53d2f97ec56653acd02`
- Frappe Builder: `frappe/builder@2d77800ab791bf7607ad168cbd03289a0f859193`
- Frappe CRM: `frappe/crm@36bd8859f2a6345a620477bc708d0546e8c3f08`
- Frappe Learning: `frappe/lms@4f73d8691c9646e0f200968c2e7af9a5d4baebaa`
- Postiz: `gitroomhq/postiz-app@64f00fd6d0e9dfd55d202ff83983e7576e08bc2e`
- Activepieces: `activepieces/activepieces@6e52092eee5a037b05d44e10e7d4e28d9b6af0d5`
- Additional pinned dependencies: `frappe/payments` and `frappe/frappe_docker`.

**What works now:** Agency Control now includes all five backend API adapters, explicit staging workspace-to-engine binding, administrator-protected read-only API checks, safe setup inventory, and a unified Platform Studios integration screen. This is a **staged code integration**, not a deployment of the upstream application servers. No Frappe, Postiz or Activepieces backend was installed/started by this milestone.

**What remains:** Provision and test separate persistent engine runtimes, assign each its own API credentials, attach them to the staging control plane, and validate their actual features. Postiz account publishing and Activepieces execution stay disabled until separately tested. GHL imports, delegated user access, media uploads and production deploy are out of scope.

## System topology

```
Agency Control (existing Next.js application on Vercel)
  ├─ Platform Studios /api/platform/engines [read-only, single admin]
  ├─ Native staging workspaces in Neon PostgreSQL
  ├─ Website Studio  ─┐
  ├─ Learning Studio  ├─→ one or more separate Frappe sites
  ├─ Customer Hub     ┘     Frappe Framework + CRM + Builder + Learning
  │                        MariaDB + Redis + workers + scheduler + assets
  ├─ Social Intelligence → separate Postiz (PostgreSQL + Redis + Node workers)
  └─ Workflow Studio    → separate Activepieces (PostgreSQL + Redis + workers)
```

A *single Frappe site* with all three apps is an **integration target**, not a verified compatibility claim. The exact pinned upstream revisions may require different Frappe branches and Python/Node versions. Validate their compatibility on a dedicated bench before deploying any combined site. If incompatible, run separate Frappe sites and give each module its own isolated settings in a future patch.

The Next.js control plane cannot host the Frappe Python server, Postiz persistent workers or Activepieces execution engine as functions on Vercel. Vercel remains the agency portal; Neon remains its separate control database. Upstream engines require persistent Docker/VM or supported managed upstream-hosted runtime. **No Railway is required**, but a persistent host outside Vercel is.

## Staging configuration — direct Vercel environment settings only

Choose one dedicated QA workspace UUID from **Workspaces**. Under the selected staging branch only, configure:

| Engine(s) | Variable | Value |
|---|---|---|
| Builder, CRM, Learning | `UPSTREAM_FRAPPE_BASE_URL` | Public HTTPS origin of verified Frappe site |
| Builder, CRM, Learning | `UPSTREAM_FRAPPE_API_KEY` | Read-only Frappe API user key, Sensitive |
| Builder, CRM, Learning | `UPSTREAM_FRAPPE_API_SECRET` | Matching read-only API secret, Sensitive |
| Builder, CRM, Learning | `UPSTREAM_FRAPPE_WORKSPACE_ID` | Exact allowed QA workspace UUID |
| Postiz | `SOCIAL_POSTIZ_BASE_URL` | Public HTTPS origin of independently deployed Postiz |
| Postiz | `SOCIAL_POSTIZ_API_KEY` | Postiz staging organization API key, Sensitive |
| Postiz | `SOCIAL_POSTIZ_ORG_ID` | Exact Postiz staging organization ID |
| Postiz | `SOCIAL_POSTIZ_WORKSPACE_ID` | Exact QA workspace UUID |
| Activepieces | `UPSTREAM_ACTIVEPIECES_BASE_URL` | Public HTTPS origin of independently deployed Activepieces |
| Activepieces | `UPSTREAM_ACTIVEPIECES_API_KEY` | Platform API bearer key, Sensitive |
| Activepieces | `UPSTREAM_ACTIVEPIECES_PROJECT_ID` | Exact 21-character project identifier |
| Activepieces | `UPSTREAM_ACTIVEPIECES_WORKSPACE_ID` | Exact QA workspace UUID |

No values from the upstream engines are currently present in the staging environment. Do not paste API secrets into source code, GitHub comments, or chat. All HTTP credentials stay server-side; `/api/platform/engines` returns only configuration booleans and variable *names*, not tokens.

**Important licensing constraint:** Activepieces documents that management API keys are provided through the Platform Dashboard and may require Platform/Enterprise licensing. If the self-hosted edition lacks a supported project API key, the integration cannot be marked as connected without using a supported authentication mechanism; do not bypass licensing or forge API access.

## Contracts and read-only verification

1. Sign in as the single staging administrator. Navigate to **Platform Studios → Connection control center**.
2. Select the exact QA workspace bound to each backend.
3. Each engine reports the missing settings or `Configured — not yet verified`.
4. Press **Verify engine API**. The server first verifies the workspace exists in Neon and audits the integration-check attempt; it then issues only authorized **GET** requests to the pre-configured upstream service. Redirects are denied; arbitrary user-supplied URLs are not accepted.
5. Builder, CRM, Learning: verify `GET /api/method/frappe.auth.get_logged_user` returns a non-Guest API user. Then query a maximum of five records using `GET /api/resource/{Builder Page|CRM Lead|LMS Course}`. A 403 means the integration user's read permission is insufficient; 404 means the app/doctype is missing.
6. Postiz: verify `GET /api/public/v1/me` is the exact configured organization and query `GET /api/public/v1/integrations`, returning at most five channel names.
7. Activepieces: enumerate accessible projects read-only through `GET /api/v1/projects`, reject the response unless the exact mapped project ID appears, then query `GET /api/v1/flows?projectId=...&limit=5`. No flow runs are triggered.
8. The UI displays only a small capped read-only sample, not arbitrary source documents. None of the current APIs can create, update, delete, publish, send or execute upstream resources.

Check results are not persisted as active provisioning grants, and a `reachable` diagnostic is not approval to publish or edit. All five engines use the *actual original upstream APIs* after the corresponding servers are deployed.

## Provisioning and compatibility gates

**Frappe platform:** Use the pinned `services/sources/frappe_docker` source as the basis for a dedicated staging Docker deployment. Provision MariaDB, Redis, queue workers and scheduler. Install the pinned CRM, Builder and Learning apps on a test bench, one app at a time; verify install/migrate, Python and Node requirements, assets build, route collisions and Frappe permissions. Preserve snapshots for rollback. Payments is **source-pinned but not activated** because no billing is requested.

**Postiz:** Deploy its unchanged source as a separate persistent service with its PostgreSQL database, Redis and workers. Create one test organization, a read-only API key and no connected publishing account until its integration can be verified. Respect Postiz AGPL-3.0 requirements.

**Activepieces:** Deploy a supported self-hosted instance and workers against separate PostgreSQL/Redis services, or use a licensed managed instance. Create a dedicated QA project and a valid Platform API key only if the chosen edition supports it. Do not enable any production automations.

**Networking:** Use protected HTTPS origins; do not directly expose MariaDB, PostgreSQL, Redis, admin consoles or queue workers on the public internet. Keep database/Redis services isolated within the engine host. Vercel's per-branch environment variables must not be copied to production.

**Acceptance gates:** Real engine identity, app/module inventory, workspace binding, three Frappe read queries, Postiz organization isolation, Activepieces project isolation, reconnect/revocation behavior and licensing obligations must pass. Only then plan controlled read/write features in a separate approval-gated milestone.

## Source and API references

- Frappe REST & auth: https://docs.frappe.io/framework/user/en/api/rest
- Frappe Docker: https://frappe.github.io/frappe_docker/01-getting-started/00-introduction.html
- Frappe CRM: https://docs.frappe.io/crm/introduction/installation
- Postiz: https://docs.postiz.com/public-api
- Activepieces API: https://www.activepieces.com/docs/endpoints/overview
- Activepieces Projects: https://www.activepieces.com/docs/endpoints/projects/list
- Activepieces Flows: https://www.activepieces.com/docs/endpoints/flows/list

Current development branch still carries a historical name: `feature/agency-five-seats-stage-20261029`. **The application enforces one administrator only.** No media upload work, client logins or production changes are part of this milestone.
