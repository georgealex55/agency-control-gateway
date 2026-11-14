# Deployment order (non-production)

1. Agency platform control plane (Next.js + `agency_platform` Neon database), currently available only to the administrator.
2. One isolated Frappe v16 bench with **compatible** Builder, CRM, Learning and Payments. Follow the pinned Frappe Docker/Bench source docs. Frappe needs its own database, queue, worker, and file storage. Do not point it at the agency control PostgreSQL database.
3. Site-level smoke tests: migration, login, frontend routes, course enrollment, lead CRUD and builder publishing on synthetic data. Verify app collisions before deciding if one site can host every Frappe app.
4. Only then deploy Postiz into an isolated social-service environment with separate storage, Redis, and credential handling.
5. Only then build server-side adapters under `ghl-gpt-gateway/lib/adapters/` with audited service identities and explicit workspace-ID authorization.
6. Activepieces and GHL migration remain deferred.

Never promote a Frappe/Postiz/automation container directly into the existing Vercel project. The existing `ghl-gpt-gateway/` root directory in Vercel must remain unchanged.

**No customer accounts, live websites, emails, domains, social integrations or payment functions are provisioned by copying/pinning this source code.**
