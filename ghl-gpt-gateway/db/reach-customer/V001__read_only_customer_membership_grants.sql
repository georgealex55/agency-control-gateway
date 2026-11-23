-- REVIEW ONLY: DO NOT RUN against production during preview development.
-- Prerequisites: the dedicated Neon role reach_customer_runtime is created by
-- the platform owner with a strong password stored ONLY in Vercel server env.
-- Do not reuse reach_app_runtime, reach_vault_app, admin or owner login.
-- This migration never creates customers or alters existing membership records.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reach_customer_runtime') THEN
  RAISE EXCEPTION 'Dedicated reach_customer_runtime role must be provisioned separately';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='agency_platform_memberships') THEN
  RAISE EXCEPTION 'Existing platform membership table not found';
 END IF;
END $$;
GRANT CONNECT ON DATABASE reach_platform TO reach_customer_runtime;
GRANT USAGE ON SCHEMA public TO reach_customer_runtime;
GRANT SELECT(id,name,slug) ON public.agency_platform_workspaces TO reach_customer_runtime;
GRANT SELECT(workspace_id,identity_subject,role) ON public.agency_platform_memberships TO reach_customer_runtime;
-- No INSERT, UPDATE, DELETE, provider token access, vault access or DDL.
-- Existing RLS and application role policies are intentionally not modified.
COMMIT;
