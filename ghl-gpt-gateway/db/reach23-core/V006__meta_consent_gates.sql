ALTER TABLE public.agency_social_meta_connections ADD COLUMN IF NOT EXISTS consent_verified_at timestamptz;
ALTER TABLE public.agency_social_meta_connections ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE INDEX IF NOT EXISTS reach_meta_workspace_active_connections
 ON public.agency_social_meta_connections(workspace_id,connected_at DESC)
 WHERE revoked_at IS NULL;
