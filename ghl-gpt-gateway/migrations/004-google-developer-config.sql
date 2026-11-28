-- Dedicated Google configuration for the single-owner workspace.
BEGIN;
CREATE TABLE public.reach_google_developer_config (
 workspace_id uuid PRIMARY KEY REFERENCES public.agency_platform_workspaces(id),
 project_id text NOT NULL, client_id text NOT NULL, sealed_config text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reach_google_developer_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reach_google_developer_config FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_google_developer_workspace ON public.reach_google_developer_config TO reach_app_runtime USING (workspace_id::text=current_setting('reach.workspace_id',true)) WITH CHECK (workspace_id::text=current_setting('reach.workspace_id',true));
REVOKE ALL ON public.reach_google_developer_config FROM PUBLIC,reach_app_runtime;
GRANT SELECT,INSERT,UPDATE ON public.reach_google_developer_config TO reach_app_runtime;
COMMIT;
