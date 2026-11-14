-- Canonical REACH personal-staging schema, ALREADY APPLIED to the explicitly
-- approved Fieldclock branch br-shiny-river-av8dqh2j (neondb).
-- Never apply to other customer databases. No legacy Fieldclock DROP operations
-- are included; those were executed once with the owner's requested reset.
BEGIN;
CREATE SCHEMA IF NOT EXISTS reach_personal_stage;
CREATE TABLE IF NOT EXISTS reach_personal_stage.connection_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('neon','google','meta','ai','website','storage')),
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected','pending','verified','expired','error')),
  last_checked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,provider)
);
CREATE TABLE IF NOT EXISTS reach_personal_stage.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lead','contact','appointment','business_profile','note')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_record_idempotency
  ON reach_personal_stage.records(workspace_id,request_id);
ALTER TABLE reach_personal_stage.connection_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE reach_personal_stage.connection_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE reach_personal_stage.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE reach_personal_stage.records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_connections_isolation ON reach_personal_stage.connection_registry;
CREATE POLICY personal_connections_isolation ON reach_personal_stage.connection_registry
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id',true),'')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id',true),'')::uuid);
DROP POLICY IF EXISTS personal_records_isolation ON reach_personal_stage.records;
CREATE POLICY personal_records_isolation ON reach_personal_stage.records
  USING (workspace_id = NULLIF(current_setting('reach.workspace_id',true),'')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('reach.workspace_id',true),'')::uuid);
COMMIT;
-- Runtime role: reach_personal_runtime, read_write only on
-- reach_personal_stage, no SUPERUSER/BYPASSRLS/CREATEROLE.
-- Use Neon serverless HTTP transaction() for SET LOCAL and subsequent query.
