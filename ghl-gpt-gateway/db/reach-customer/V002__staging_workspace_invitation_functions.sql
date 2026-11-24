-- Connections 3.0 / Phase 2: STAGING-ONLY preview invitation functions.
-- Applied to Neon staging branch br-calm-block-bdxsar49 (not production).
-- Use dedicated reach_invite_runtime with read_only access ONLY to
-- reach_customer_invites schema; never GRANT on public Meta token tables.
BEGIN;
CREATE SCHEMA IF NOT EXISTS reach_secret_invites;
CREATE SCHEMA IF NOT EXISTS reach_customer_invites;
CREATE TABLE IF NOT EXISTS reach_secret_invites.pending (
 token_hash CHAR(64) PRIMARY KEY,
 workspace_id UUID NOT NULL REFERENCES public.agency_platform_workspaces(id),
 email TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('client_owner','client_editor','instructor','viewer')),
 expires_at TIMESTAMPTZ NOT NULL,
 accepted_at TIMESTAMPTZ,
 accepted_subject TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION reach_customer_invites.issue(
 p_hash TEXT,p_workspace UUID,p_email TEXT,p_role TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_hash!~'^[a-f0-9]{64}$' OR LENGTH(p_email)>254 OR
 p_email!~'^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' OR
 p_role NOT IN ('client_owner','client_editor','instructor','viewer') THEN RETURN FALSE; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agency_platform_workspaces WHERE id=p_workspace) THEN RETURN FALSE; END IF;
 INSERT INTO reach_secret_invites.pending(token_hash,workspace_id,email,role,expires_at)
 VALUES(p_hash,p_workspace,LOWER(p_email),p_role,NOW()+INTERVAL '48 hours');
 RETURN TRUE;
END $$;
CREATE OR REPLACE FUNCTION reach_customer_invites.accept(
 p_hash TEXT,p_subject TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected_workspace UUID; selected_role TEXT;
BEGIN
 IF p_hash!~'^[a-f0-9]{64}$' OR p_subject!~'^[A-Za-z0-9:_-]{6,200}$' THEN RETURN FALSE; END IF;
 UPDATE reach_secret_invites.pending i SET accepted_at=NOW(),accepted_subject=p_subject
 WHERE i.token_hash=p_hash AND i.accepted_at IS NULL AND i.expires_at>NOW()
 AND EXISTS(
  SELECT 1 FROM neon_auth."user" u
  WHERE 'neon_auth:'||u.id::text=p_subject AND u."emailVerified" IS TRUE
    AND u.banned IS DISTINCT FROM TRUE AND LOWER(u.email)=i.email
 )
 RETURNING i.workspace_id,i.role INTO selected_workspace,selected_role;
 IF selected_workspace IS NULL THEN RETURN FALSE; END IF;
 INSERT INTO public.agency_platform_memberships(workspace_id,identity_subject,role)
 VALUES(selected_workspace,p_subject,selected_role)
 ON CONFLICT(workspace_id,identity_subject) DO NOTHING;
 RETURN TRUE;
END $$;
CREATE OR REPLACE FUNCTION reach_customer_invites.available_workspaces()
RETURNS TABLE(id UUID,name TEXT) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $
 SELECT w.id,w.name::TEXT FROM public.agency_platform_workspaces w ORDER BY w.name ASC LIMIT 100
$;
REVOKE ALL ON SCHEMA reach_secret_invites FROM PUBLIC;
REVOKE ALL ON SCHEMA reach_customer_invites FROM PUBLIC;
REVOKE ALL ON FUNCTION reach_customer_invites.issue(TEXT,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reach_customer_invites.accept(TEXT,TEXT) FROM PUBLIC;
-- Provision reach_invite_runtime separately with read_only schema scope.
GRANT CONNECT ON DATABASE reach_platform TO reach_invite_runtime;
GRANT USAGE ON SCHEMA reach_customer_invites TO reach_invite_runtime;
GRANT EXECUTE ON FUNCTION reach_customer_invites.issue(TEXT,UUID,TEXT,TEXT) TO reach_invite_runtime;
GRANT EXECUTE ON FUNCTION reach_customer_invites.accept(TEXT,TEXT) TO reach_invite_runtime;
REVOKE ALL ON FUNCTION reach_customer_invites.available_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reach_customer_invites.available_workspaces() TO reach_invite_runtime;
COMMIT;
