-- Staging-only superseding migration: one agency administrator, zero other people.
-- Requires migration 005; do not run in production without explicit approval.
BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM agency_platform_users) <> 1 OR
    (SELECT count(*) FROM agency_platform_users WHERE is_system_admin AND status='active' AND principal_key='agency-admin') <> 1
 THEN RAISE EXCEPTION 'Only one active system administrator can exist before entering single-admin mode'; END IF;
END $$;
ALTER TABLE agency_platform_users ADD CONSTRAINT agency_platform_single_admin_only CHECK (is_system_admin=true);
ALTER TABLE agency_platform_user_capacity DROP CONSTRAINT agency_platform_user_capacity_max_users_check;
ALTER TABLE agency_platform_user_capacity DROP CONSTRAINT agency_platform_user_capacity_occupied_check;
UPDATE agency_platform_user_capacity SET max_users=1 WHERE id=1 AND occupied=1;
ALTER TABLE agency_platform_user_capacity ADD CONSTRAINT agency_platform_user_capacity_max_users_check CHECK(max_users=1);
ALTER TABLE agency_platform_user_capacity ADD CONSTRAINT agency_platform_user_capacity_occupied_check CHECK(occupied BETWEEN 0 AND 1);
COMMIT;
