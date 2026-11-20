-- REACH 2.3 owner Meta app onboarding; independent of Facebook/Instagram user tokens.
-- Exact target project red-violet-71016741 / reach_platform / main.
-- Additive migration; never put real app secrets into SQL.
CREATE TABLE reach_vault.owner_meta_apps (
 owner_key text NOT NULL DEFAULT 'primary-owner'
   CHECK (owner_key='primary-owner'),
 provider varchar(32) NOT NULL
   CHECK (provider IN ('facebook_pages','instagram_professional')),
 client_id varchar(32) NOT NULL
   CHECK (client_id ~ '^[0-9]{6,32}$'),
 sealed_client_secret text NOT NULL
   CHECK (length(sealed_client_secret) BETWEEN 30 AND 2500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_key,provider)
);
ALTER TABLE reach_vault.owner_meta_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE reach_vault.owner_meta_apps FORCE ROW LEVEL SECURITY;
CREATE POLICY reach_meta_owner_app_scope ON reach_vault.owner_meta_apps
 FOR ALL TO reach_vault_app
 USING (owner_key='primary-owner') WITH CHECK (owner_key='primary-owner');
GRANT SELECT,INSERT,UPDATE,DELETE ON reach_vault.owner_meta_apps TO reach_vault_app;
