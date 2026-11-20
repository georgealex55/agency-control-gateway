-- REACH single-owner vault additive migration V001.
-- Target: project red-violet-71016741, branch br-sweet-frost-bd8jhzep,
-- database reach_platform, owner reach_platform_owner.
CREATE SCHEMA IF NOT EXISTS reach_vault AUTHORIZATION reach_platform_owner;
CREATE TABLE IF NOT EXISTS reach_vault.owner_neon_connections (
 owner_key text PRIMARY KEY CHECK (owner_key = 'primary-owner'),
 sealed_credential text NOT NULL CHECK (length(sealed_credential) BETWEEN 30 AND 9000),
 database_name text NOT NULL CHECK (length(database_name) BETWEEN 1 AND 63),
 role_name text NOT NULL CHECK (length(role_name) BETWEEN 1 AND 128),
 hostname text NOT NULL CHECK (length(hostname) BETWEEN 1 AND 253),
 verified_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE reach_vault.owner_neon_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE reach_vault.owner_neon_connections FORCE ROW LEVEL SECURITY;