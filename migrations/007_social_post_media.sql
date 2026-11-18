-- Staging only. Associates private media with the correct social post and workspace.
-- Composite tenant FKs reject cross-workspace associations even if the HTTP layer fails.
CREATE UNIQUE INDEX IF NOT EXISTS agency_social_post_workspace_fk ON agency_social_posts(workspace_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS agency_social_media_workspace_fk ON agency_social_media(workspace_id,id);
CREATE TABLE IF NOT EXISTS agency_social_post_media (
 workspace_id UUID NOT NULL REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,
 post_id UUID NOT NULL,
 media_id UUID NOT NULL,
 attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(post_id,media_id),
 FOREIGN KEY(workspace_id,post_id) REFERENCES agency_social_posts(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,media_id) REFERENCES agency_social_media(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agency_social_post_media_by_workspace
 ON agency_social_post_media(workspace_id,post_id,attached_at);
