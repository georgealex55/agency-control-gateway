-- Production applied 2026-11-20 after synthetic branch regression.
CREATE TABLE public.agency_reach_neon_connections (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
 label varchar(100) NOT NULL,
 endpoint_hostname varchar(255) NOT NULL,
 database_name varchar(63) NOT NULL,
 role_name varchar(128) NOT NULL,
 encrypted_dsn text NOT NULL CHECK (encrypted_dsn LIKE 'v1.%'),
 encryption_key_version smallint NOT NULL CHECK (encryption_key_version>=1),
 last_verified_at timestamptz,
 verification_status varchar(20) NOT NULL DEFAULT 'unverified'
   CHECK (verification_status IN ('unverified','verified','unreachable','revoked')),
 credential_rotated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 UNIQUE (workspace_id,id),
 CHECK (length(encrypted_dsn)<=8192)
);
CREATE INDEX agency_reach_neon_connections_ws_active
 ON public.agency_reach_neon_connections(workspace_id,created_at DESC)
 WHERE deleted_at IS NULL;
ALTER TABLE public.agency_reach_neon_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_reach_neon_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY neon_workspace_scope ON public.agency_reach_neon_connections
 FOR ALL TO reach_app_runtime
 USING (workspace_id = NULLIF(current_setting('reach.workspace_id',true),'')::uuid)
 WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id',true),'')::uuid);
REVOKE ALL ON public.agency_reach_neon_connections FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.agency_reach_neon_connections TO reach_app_runtime;
