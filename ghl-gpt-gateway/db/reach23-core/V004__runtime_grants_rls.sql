-- REVIEW ONLY. Requires V001-V003 and approved creation of
-- reach_app_runtime with LOGIN, no owner/admin, no BYPASSRLS.
-- Never run with an application credential.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles
                 WHERE rolname = 'reach_app_runtime') THEN
    RAISE EXCEPTION 'reach_app_runtime must be provisioned and reviewed first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'reach_app_runtime'
      AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'runtime role has prohibited administrative privileges';
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM reach_app_runtime;
GRANT CONNECT ON DATABASE reach_platform TO reach_app_runtime;
GRANT USAGE ON SCHEMA public TO reach_app_runtime;

-- Remove any broad grants conferred during role provisioning.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM reach_app_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM reach_app_runtime;

-- Explicit table-level DML: no migration ledger access, no DDL.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.agency_platform_workspaces,
  public.agency_platform_module_plans,
  public.agency_platform_audit_events,
  public.agency_platform_domains,
  public.agency_platform_memberships,
  public.agency_reach_command_layouts,
  public.agency_social_meta_oauth_flows,
  public.agency_social_meta_pending,
  public.agency_social_meta_connections
TO reach_app_runtime;
GRANT USAGE, SELECT ON SEQUENCE
  public.agency_platform_audit_events_id_seq TO reach_app_runtime;
REVOKE ALL ON public.reach_schema_migrations FROM reach_app_runtime;

-- Workspace root uses id; dependent rows use workspace_id.
ALTER TABLE public.agency_platform_workspaces
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_platform_workspaces
  FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_platform_workspaces FOR ALL TO reach_app_runtime
  USING (id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_platform_module_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_platform_module_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_platform_module_plans FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_platform_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_platform_audit_events FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_platform_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_platform_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_platform_domains FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_platform_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_platform_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_platform_memberships FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_reach_command_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_reach_command_layouts FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_reach_command_layouts FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_social_meta_oauth_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_social_meta_oauth_flows FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_social_meta_oauth_flows FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_social_meta_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_social_meta_pending FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_social_meta_pending FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);

ALTER TABLE public.agency_social_meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_social_meta_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope
  ON public.agency_social_meta_connections FOR ALL TO reach_app_runtime
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);