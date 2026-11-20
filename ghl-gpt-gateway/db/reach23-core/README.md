# REACH 2.3 workspace + Meta schema (V001–V006)
- Migrated to Neon project red-violet-71016741, branch br-sweet-frost-bd8jhzep, database reach_platform on 2026-11-20.
- First rehearsed on synthetic branch br-icy-field-bdnpamr4 with fictional Alpha/Beta workspaces.
- Production applied additively as separate atomic SQL transactions. No DROP/TRUNCATE.
- Role reach_app_runtime is scoped to database reach_platform/public, non-superuser and non-BYPASSRLS.
- Production owner workspace: 9df73aab-f6c7-43ea-9efe-e78911501420.
- IMPORTANT: migrations V001–V004 were originally reviewed in GitHub issue #21; V004's role-existence DO preflight was performed by the agent beforehand instead of being executed as part of the SQL block. The migration ledger was created but is not yet populated; **do not apply these files again automatically**. Next changes must be a new V00x and should establish checksummed migration-ledger reconciliation first.
- RLS policies use transaction-local reach.workspace_id as defense in depth. The GUC is not an authenticated identity; application APIs must validate ownership before applying it. Only the existing REACH owner account is supported at present.
- V001-V006 do not enable Meta OAuth, publishing, posting, messaging or automatic token refresh. The social owner-scoped runtime uses a separate production-only connection role and environment variable.
- Platform-store.ts still performs legacy request-time DDL against AGENCY_PLATFORM_DATABASE_URL. Do not direct it at this role/DB or enable the old generic gate. Meta storage is routed via reach-social-owner-db.ts instead.
