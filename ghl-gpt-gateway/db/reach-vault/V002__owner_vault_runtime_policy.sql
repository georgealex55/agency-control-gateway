-- REACH owner vault V002: execute only after restricted role exists.
-- Role reach_vault_app must be non-admin, database and schema scoped.
CREATE POLICY reach_vault_owner_only ON reach_vault.owner_neon_connections
 FOR ALL TO reach_vault_app
 USING (owner_key = 'primary-owner')
 WITH CHECK (owner_key = 'primary-owner');