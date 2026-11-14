# REACH personal staging — Fieldclock database reuse and verified connection (2026-11-14)

## Owner instruction and scope
The owner explicitly instructed reuse of the existing **Fieldclock Neon project**, scrapping its old data and enabling REACH to recognize the database and store newly entered platform information. Scope was exact: Neon project `lively-morning-77987546`, branch `br-shiny-river-av8dqh2j` (`main`), database `neondb`. Other Neon projects, GitHub main, production deployments, customer accounts and outbound integrations remain untouched.

## Changes executed in Neon
1. Verified the target was Fieldclock, read-write endpoint `ep-wispy-shape-avlihp8l`, database `neondb`. Its branch was archived and was automatically awakened by read-only inspection.
2. Removed the **11 old Fieldclock public tables** in one transaction, with their old application records: `accrual_balances`, `audit_events`, `employee_preferences`, `employees`, `location_events`, `login_codes`, `organizations`, `sessions`, `shifts`, `time_off_requests`, `weekly_credits`. This is a real deletion under the user's specific reset request; no backup or branch copy was created in this pass.
3. Created `reach_personal_stage.connection_registry` and `reach_personal_stage.records`; enabled and **FORCED** workspace RLS on both; added idempotency index `personal_record_idempotency`.
4. Created scoped `reach_personal_runtime` Postgres role with read/write on schema `reach_personal_stage` only. Verified `rolbypassrls=false`, `rolsuper=false`, `rolcreaterole=false`.
5. Verified synthetic **insert → select → delete** under the runtime role, with zero records remaining. Verified a row visible in the approved workspace was invisible from a different workspace using the same runtime role, then deleted the synthetic record; zero remain.
6. Subsequent table listing found **exactly two** application tables in `neondb` and none of the 11 old Fieldclock tables.

## Vercel binding and code
- Used existing Vercel project `agency-control-gateway`. Created only branch-scoped `preview` environment variables on Git branch `experiment/gohyperlevel-synthetic-poc-20261104`: sensitive `REACH_PERSONAL_DATABASE_URL` with pooled Fieldclock URL and restricted role; plain `REACH_NEON_STAGING_BRANCH_ID`, `REACH_PERSONAL_NEON_PROJECT_ID`, `REACH_PERSONAL_WORKSPACE_ID`. No credentials printed or committed. Existing global platform/GHL credentials unchanged.
- `lib/connections/fieldclock-db.ts` validates exact project, branch, hostname, database and restricted runtime role before opening a connection; queries and writes are workspace-scoped using transaction-local `set_config`.
- `app/api/reach/personal/storage/route.ts` executes a **real read-only DB query** and returns minimal health; no credentials, hostname or account data.
- `app/api/reach/personal/records/route.ts` enforces Neon owner token verification, same-origin writes, explicit `approved:true`, bounded input and idempotency; rejects access until Neon Auth is provisioned and pinned to the owner. No external sends, publishes or automations.
- `app/reach-connections/page.tsx` exposes live status and a prepared manual-entry UI. **Save is deliberately disabled** until verified Neon Auth owner login; do not claim owner data entry is live.
- Next.js 15 cannot resolve the tested Neon Auth browser SDK 0.2, 0.3, 0.5 or 0.7 beta due to its peer requirement `next >=16`. Removed incompatible dependency and retained Next 15. A separately approved auth adapter or Next major upgrade is required for the browser login. Existing JWT verifier is still fail-closed.
- Root platform dashboard and offline REACH shell both link to the live Neon Connections screen; shell and preview mirror are synchronized.
- Canonical schema (without legacy DROP statements): `ghl-gpt-gateway/db/staging/20261114_fieldclock_reach_personal_storage.sql`.

## Evidence
- Platform build / agency policy / Connections contract on `cc66b98ee1...`: all successful, GitHub Actions runs 43550997415 / 43550997544 / 43550997396.
- Vercel preview from `44d6754280...` READY at `https://agency-control-gateway-1mwknb10l-georgealex1925-2750s-projects.vercel.app`.
- Authenticated Vercel deployment HTTP fetch: `/api/reach/personal/storage` returned **HTTP 200**, `connected:true`, `reason:verified_read_only_query`, `storageReady:true`, `authenticatedWritesEnabled:false`, `authPending:true`. `/reach-connections` returned HTTP 200.
- Neon Auth was **not provisioned** and no real owner or customer record was stored.

## Final gate for real entry
Explicit user approval to provision Neon Auth for Fieldclock (not other projects), plus the intended owner email/identity via a secure flow and a Next15-compatible Neon Auth browser integration (or explicitly approved Next16 upgrade). Then verify issuer/JWKS/audience/owner subject, token lifetime, login/logout, replay, exact staging origins, runtime RLS and end-to-end create/read, with outbound actions disabled. Never use the old dummy login for live writes.
