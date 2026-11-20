-- REVIEW ONLY: target project red-violet-71016741 /
-- main branch br-sweet-frost-bd8jhzep / database reach_platform.
-- Migration connection: reach_platform_owner, direct/non-pooled.
-- Must be wrapped atomically by reviewed migration runner.

CREATE TABLE public.reach_schema_migrations (
  version VARCHAR(8) PRIMARY KEY CHECK (version ~ '^V[0-9]{3}$'),
  checksum_sha256 CHAR(64) NOT NULL
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agency_platform_workspaces (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  business_type VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agency_platform_module_plans (
  workspace_id UUID NOT NULL
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  module_key VARCHAR(40) NOT NULL,
  rollout_state VARCHAR(20) NOT NULL
    CHECK (rollout_state IN ('hidden', 'planned')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, module_key)
);

CREATE TABLE public.agency_platform_audit_events (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  action VARCHAR(80) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(detail) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agency_platform_audit_events_by_workspace_time
  ON public.agency_platform_audit_events (workspace_id, created_at DESC);

CREATE TABLE public.agency_platform_domains (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  hostname VARCHAR(255) NOT NULL UNIQUE,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agency_platform_domains_by_workspace
  ON public.agency_platform_domains (workspace_id);

CREATE TABLE public.agency_platform_memberships (
  workspace_id UUID NOT NULL
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  identity_subject VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK
    (role IN ('client_owner', 'client_editor', 'instructor', 'viewer')),
  PRIMARY KEY (workspace_id, identity_subject)
);
CREATE INDEX agency_platform_memberships_by_subject
  ON public.agency_platform_memberships (identity_subject, workspace_id);