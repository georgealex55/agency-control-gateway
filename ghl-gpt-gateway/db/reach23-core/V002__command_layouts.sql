-- REVIEW ONLY: dependent on V001.
CREATE TABLE public.agency_reach_command_layouts (
  workspace_id UUID PRIMARY KEY
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  layout JSONB NOT NULL CHECK (jsonb_typeof(layout) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);