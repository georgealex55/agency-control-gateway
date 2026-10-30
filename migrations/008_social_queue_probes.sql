-- Staging-only, synthetic queue delivery probes. No external content is published.
CREATE TABLE IF NOT EXISTS agency_social_queue_probes (
 id UUID PRIMARY KEY,
 workspace_id UUID NOT NULL REFERENCES agency_platform_workspaces(id) ON DELETE CASCADE,
 rate_bucket TIMESTAMPTZ NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('prepared','sent','acknowledged','send_failed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 sent_at TIMESTAMPTZ,
 acknowledged_at TIMESTAMPTZ,
 last_error_code VARCHAR(60),
 UNIQUE(workspace_id,rate_bucket)
);
CREATE INDEX IF NOT EXISTS agency_social_queue_probes_workspace_idx
 ON agency_social_queue_probes(workspace_id,created_at DESC);
