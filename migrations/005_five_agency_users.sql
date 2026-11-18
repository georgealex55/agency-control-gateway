-- Staging migration 005: five human seats TOTAL across the agency, including administrator.
-- Do not execute on production until approved. Platform app endpoints never run migrations.
CREATE TABLE IF NOT EXISTS agency_platform_user_capacity (
 id integer PRIMARY KEY CHECK(id=1),
 max_users integer NOT NULL DEFAULT 5 CHECK(max_users=5),
 occupied integer NOT NULL DEFAULT 0 CHECK(occupied BETWEEN 0 AND 5)
);
INSERT INTO agency_platform_user_capacity(id,max_users,occupied)
VALUES(1,5,0) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS agency_platform_users (
 id UUID PRIMARY KEY,
 email VARCHAR(254),
 display_name VARCHAR(120) NOT NULL,
 role VARCHAR(30) NOT NULL CHECK(role IN ('admin','client_owner','client_editor','viewer')),
 status VARCHAR(20) NOT NULL CHECK(status IN ('reserved','active','disabled')),
 is_system_admin boolean NOT NULL DEFAULT false,
 principal_key VARCHAR(120) UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(email IS NULL OR (email=lower(trim(email)) AND length(email)>3 AND email LIKE '%@%')),
 CHECK(is_system_admin=false OR (role='admin' AND status='active' AND email IS NULL AND principal_key='agency-admin')),
 -- Until verified individual auth exists, non-admin users are reservations only.
 CHECK(is_system_admin=true OR (role<>'admin' AND status<>'active' AND principal_key IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_platform_user_email_unique
 ON agency_platform_users (lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION agency_platform_guard_seat_capacity()
RETURNS trigger AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status IN ('active','reserved') THEN
     UPDATE agency_platform_user_capacity
       SET occupied=occupied+1 WHERE id=1 AND occupied<max_users;
     IF NOT FOUND THEN
       RAISE EXCEPTION 'Agency user limit reached (5)' USING ERRCODE='23514';
     END IF;
   END IF;
   RETURN NEW;
 ELSIF TG_OP='UPDATE' THEN
   IF OLD.is_system_admin AND
      (NEW.status<>'active' OR NOT NEW.is_system_admin OR NEW.role<>'admin') THEN
      RAISE EXCEPTION 'Cannot remove agency administrator seat' USING ERRCODE='23514';
   END IF;
   IF OLD.status IN ('active','reserved') AND NEW.status='disabled' THEN
     UPDATE agency_platform_user_capacity SET occupied=occupied-1
      WHERE id=1 AND occupied>0;
   ELSIF OLD.status='disabled' AND NEW.status IN ('active','reserved') THEN
     UPDATE agency_platform_user_capacity SET occupied=occupied+1
      WHERE id=1 AND occupied<max_users;
     IF NOT FOUND THEN
       RAISE EXCEPTION 'Agency user limit reached (5)' USING ERRCODE='23514';
     END IF;
   END IF;
   RETURN NEW;
 ELSIF TG_OP='DELETE' THEN
   IF OLD.is_system_admin THEN
     RAISE EXCEPTION 'Cannot delete agency admin' USING ERRCODE='23514';
   END IF;
   IF OLD.status IN ('active','reserved') THEN
     UPDATE agency_platform_user_capacity SET occupied=occupied-1 WHERE id=1 AND occupied>0;
   END IF;
   RETURN OLD;
 END IF;
 RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_platform_seat_capacity_trigger ON agency_platform_users;
CREATE TRIGGER agency_platform_seat_capacity_trigger
 AFTER INSERT OR UPDATE OF status,role,is_system_admin OR DELETE
 ON agency_platform_users FOR EACH ROW
 EXECUTE FUNCTION agency_platform_guard_seat_capacity();

INSERT INTO agency_platform_users(id,email,display_name,role,status,is_system_admin,principal_key)
VALUES('6f64ae50-a7b5-4659-bd5d-9ad056965422'::uuid,
       NULL,'Agency Administrator','admin','active',true,'agency-admin')
ON CONFLICT(principal_key) DO NOTHING;
