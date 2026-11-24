-- REACH customer membership view/grants. STAGING ONLY until independently approved.
-- Applied manually on isolated br-calm-block-bdxsar49; do not run on production.
-- reach_customer_runtime is created via Neon with read_only access to this
-- exact schema, NOT to public or neon_auth (which contain other sensitive data).
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reach_customer_runtime') THEN
  RAISE EXCEPTION 'Dedicated reach_customer_runtime role missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='neon_auth' AND table_name='user') THEN
  RAISE EXCEPTION 'Neon Auth user table not present';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS reach_customer;
CREATE OR REPLACE VIEW reach_customer.verified_memberships AS
 SELECT w.id,w.name,w.slug,m.role,m.identity_subject
 FROM public.agency_platform_memberships m
 JOIN public.agency_platform_workspaces w ON w.id=m.workspace_id
 JOIN neon_auth."user" u ON m.identity_subject=('neon_auth:'||u.id::text)
 WHERE u."emailVerified" IS TRUE AND u.banned IS DISTINCT FROM TRUE;
REVOKE ALL ON SCHEMA reach_customer FROM PUBLIC;
REVOKE ALL ON reach_customer.verified_memberships FROM PUBLIC;
GRANT CONNECT ON DATABASE reach_platform TO reach_customer_runtime;
GRANT USAGE ON SCHEMA reach_customer TO reach_customer_runtime;
GRANT SELECT ON reach_customer.verified_memberships TO reach_customer_runtime;
-- No grants on public tables, neon_auth user records, provider tokens or vault.
COMMIT;
