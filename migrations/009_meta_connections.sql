-- Isolated staging only. No provider token, social publishing or OAuth flow is activated by this migration.
ALTER TABLE agency_social_meta_connections ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE agency_social_meta_connections ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS agency_social_meta_pending (
 id UUID PRIMARY KEY,
 workspace_id UUID NOT NULL REFERENCES agency_platform_workspaces(id) ON DELETE CASCADE,
 provider VARCHAR(32) NOT NULL CHECK(provider IN ('facebook_pages','instagram_professional')),
 encrypted_token TEXT NOT NULL,
 candidates JSONB NOT NULL CHECK(jsonb_typeof(candidates)='array'),
 token_expires_at TIMESTAMPTZ,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_social_meta_pending_workspace
 ON agency_social_meta_pending(workspace_id,expires_at DESC);
CREATE INDEX IF NOT EXISTS agency_social_meta_connections_by_workspace
 ON agency_social_meta_connections(workspace_id,connected_at DESC);
