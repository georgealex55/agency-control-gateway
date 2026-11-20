-- REVIEW ONLY. Requires V001: agency_platform_workspaces and audit_events.
-- Provider vocabulary matches social-meta-contract.ts exactly:
-- facebook_pages | instagram_professional.

CREATE TABLE public.agency_social_meta_oauth_flows (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK
    (provider IN ('facebook_pages', 'instagram_professional')),
  nonce_hash CHAR(64) NOT NULL
    CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, nonce_hash)
);
CREATE INDEX agency_social_meta_flows_recent
  ON public.agency_social_meta_oauth_flows
  (workspace_id, created_at DESC);
CREATE INDEX agency_social_meta_flows_expiry
  ON public.agency_social_meta_oauth_flows (workspace_id, expires_at);

CREATE TABLE public.agency_social_meta_pending (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK
    (provider IN ('facebook_pages', 'instagram_professional')),
  encrypted_token TEXT NOT NULL CHECK (encrypted_token LIKE 'v1.%'),
  candidates JSONB NOT NULL CHECK (
    CASE WHEN jsonb_typeof(candidates) = 'array'
      THEN jsonb_array_length(candidates) BETWEEN 1 AND 25
      ELSE false END
  ),
  token_expires_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX agency_social_meta_pending_by_workspace_expiry
  ON public.agency_social_meta_pending
  (workspace_id, expires_at);

CREATE TABLE public.agency_social_meta_connections (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL
    REFERENCES public.agency_platform_workspaces(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK
    (provider IN ('facebook_pages', 'instagram_professional')),
  provider_account_id VARCHAR(40) NOT NULL
    CHECK (provider_account_id ~ '^[0-9]{2,40}$'),
  provider_display_name VARCHAR(150) NOT NULL,
  encrypted_access_token TEXT NOT NULL
    CHECK (encrypted_access_token LIKE 'v1.%'),
  granted_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, provider_account_id)
);
CREATE INDEX agency_social_meta_connections_by_workspace_time
  ON public.agency_social_meta_connections
  (workspace_id, connected_at DESC);