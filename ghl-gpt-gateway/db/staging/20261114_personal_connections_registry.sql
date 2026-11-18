-- PLAN ONLY: apply exclusively to an explicitly approved, isolated REACH
-- personal-staging Neon branch. NEVER run against production/default.
-- Application must SET LOCAL reach.workspace_id inside each transaction.
BEGIN;
CREATE SCHEMA IF NOT EXISTS reach_personal_stage;
CREATE TABLE IF NOT EXISTS reach_personal_stage.connection_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('neon','google','meta','ai','website','storage')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','pending','verified','expired','error')),
  last_checked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);
ALTER TABLE reach_personal_stage.connection_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE reach_personal_stage.connection_registry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_connection_isolation ON reach_personal_stage.connection_registry;
CREATE POLICY workspace_connection_isolation ON reach_personal_stage.connection_registry
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id', true), '')::uuid);
-- The runtime DB role must NOT own the table and must NOT have BYPASSRLS.
-- Never store tokens, credentials or customer data in metadata.
COMMIT;
