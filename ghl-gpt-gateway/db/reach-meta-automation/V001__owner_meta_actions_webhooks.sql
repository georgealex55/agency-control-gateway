-- REACH Meta Social Automation V1: explicit account-bound and approval-bound delivery.
-- Apply on isolated Neon staging first. Production migration must be an approved release.
CREATE TABLE IF NOT EXISTS public.agency_social_meta_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.agency_platform_workspaces(id),
 connection_id uuid NOT NULL REFERENCES public.agency_social_meta_connections(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('facebook_post','instagram_photo','facebook_comment_reply','instagram_comment_reply','facebook_message_reply','instagram_message_reply')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2200),
 media_url text,
 target_id varchar(100),
 scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sending','sent','uncertain','blocked','canceled')),
 idempotency_key uuid NOT NULL,
 approved_at timestamptz,
 attempted_at timestamptz,
 completed_at timestamptz,
 external_ref varchar(140),
 error_code varchar(80),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workspace_id,idempotency_key),
 CHECK ((kind='instagram_photo' AND media_url IS NOT NULL) OR (kind<>'instagram_photo' AND media_url IS NULL)),
 CHECK ((kind LIKE '%_reply' AND target_id IS NOT NULL) OR (kind NOT LIKE '%_reply' AND target_id IS NULL))
);
CREATE INDEX IF NOT EXISTS agency_social_meta_actions_due_idx ON public.agency_social_meta_actions(workspace_id,scheduled_at) WHERE status='approved';
ALTER TABLE public.agency_social_meta_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_social_meta_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope ON public.agency_social_meta_actions TO reach_app_runtime
 USING (workspace_id = nullif(current_setting('reach.workspace_id',true),'')::uuid)
 WITH CHECK (workspace_id = nullif(current_setting('reach.workspace_id',true),'')::uuid);
REVOKE ALL ON public.agency_social_meta_actions FROM PUBLIC;
REVOKE ALL ON public.agency_social_meta_actions FROM reach_app_runtime;
GRANT SELECT,INSERT,UPDATE ON public.agency_social_meta_actions TO reach_app_runtime;
CREATE TABLE IF NOT EXISTS public.agency_social_meta_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.agency_platform_workspaces(id),
 connection_id uuid NOT NULL REFERENCES public.agency_social_meta_connections(id) ON DELETE CASCADE,
 event_hash char(64) NOT NULL,
 event_type varchar(40) NOT NULL,
 target_id varchar(100),
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 sender_id varchar(40),
 UNIQUE(workspace_id,event_hash)
);
CREATE INDEX IF NOT EXISTS agency_social_meta_inbound_idx ON public.agency_social_meta_webhook_events(workspace_id,connection_id,sender_id,occurred_at DESC) WHERE sender_id IS NOT NULL;
ALTER TABLE public.agency_social_meta_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_social_meta_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_runtime_scope ON public.agency_social_meta_webhook_events TO reach_app_runtime
 USING (workspace_id = nullif(current_setting('reach.workspace_id',true),'')::uuid)
 WITH CHECK (workspace_id = nullif(current_setting('reach.workspace_id',true),'')::uuid);
REVOKE ALL ON public.agency_social_meta_webhook_events FROM PUBLIC;
REVOKE ALL ON public.agency_social_meta_webhook_events FROM reach_app_runtime;
GRANT SELECT,INSERT,DELETE ON public.agency_social_meta_webhook_events TO reach_app_runtime;
