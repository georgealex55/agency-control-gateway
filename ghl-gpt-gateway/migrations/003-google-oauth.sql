-- Additive, single-owner Google OAuth storage; apply only after staging review.
BEGIN;
CREATE TABLE public.reach_google_flows (
 workspace_id uuid NOT NULL REFERENCES public.agency_platform_workspaces(id),
 state_hash text PRIMARY KEY, browser_hash text NOT NULL, group_id text NOT NULL,
 domain_id uuid, sealed_verifier text NOT NULL, client_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE public.reach_google_pending (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES public.agency_platform_workspaces(id),
 group_id text NOT NULL, domain_id uuid, subject text NOT NULL, email text NOT NULL,
 scopes text[] NOT NULL, sealed_refresh text NOT NULL, client_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE public.reach_google_connections (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES public.agency_platform_workspaces(id),
 group_id text NOT NULL, domain_id uuid, subject text NOT NULL, email text NOT NULL,
 resource_id text NOT NULL, resource_name text NOT NULL, scopes text[] NOT NULL,
 sealed_refresh text NOT NULL, client_hash text NOT NULL, connected_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE NULLS NOT DISTINCT (workspace_id,group_id,domain_id,resource_id,subject)
);
CREATE UNIQUE INDEX reach_google_one_site_mapping ON public.reach_google_connections(workspace_id,group_id,domain_id) WHERE domain_id IS NOT NULL;
CREATE INDEX reach_google_flow_expiry ON public.reach_google_flows(workspace_id,expires_at);
CREATE INDEX reach_google_pending_expiry ON public.reach_google_pending(workspace_id,expires_at);
ALTER TABLE public.reach_google_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reach_google_flows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reach_google_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reach_google_pending FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reach_google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reach_google_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_google_flow_workspace ON public.reach_google_flows TO reach_app_runtime USING (workspace_id::text=current_setting('reach.workspace_id',true)) WITH CHECK (workspace_id::text=current_setting('reach.workspace_id',true));
CREATE POLICY reach_google_pending_workspace ON public.reach_google_pending TO reach_app_runtime USING (workspace_id::text=current_setting('reach.workspace_id',true)) WITH CHECK (workspace_id::text=current_setting('reach.workspace_id',true));
CREATE POLICY reach_google_connection_workspace ON public.reach_google_connections TO reach_app_runtime USING (workspace_id::text=current_setting('reach.workspace_id',true)) WITH CHECK (workspace_id::text=current_setting('reach.workspace_id',true));
REVOKE ALL ON public.reach_google_flows,public.reach_google_pending,public.reach_google_connections FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON public.reach_google_flows,public.reach_google_pending TO reach_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reach_google_connections TO reach_app_runtime;
COMMIT;
