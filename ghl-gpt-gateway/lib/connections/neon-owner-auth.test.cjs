'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const auth=fs.readFileSync(path.join(__dirname,'neon-owner-auth.ts'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../../db/staging/20261114_personal_connections_registry.sql'),'utf8');
test('Neon owner auth is disabled by default and never trusts demo portal sessions',()=>{
 assert.match(auth,/REACH_PERSONAL_CONNECTIONS_ENABLED === "true"/);
 assert.match(auth,/REACH_NEON_STAGING_BRANCH_ID/);
 assert.match(auth,/payload.sub !== c.owner/);
 assert.match(auth,/jwtVerify\(/);
 assert.match(auth,/algorithms: \["RS256", "ES256"\]/);
 assert.doesNotMatch(auth,/adminAuthenticated|agency_portal_session/);
});
test('prepared migration is RLS forced, workspace scoped and has no token column',()=>{
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/WITH CHECK \(workspace_id/);
 assert.match(migration,/current_setting\('reach.workspace_id'/);
 assert.doesNotMatch(migration,/\b(token|password|secret)\s+(text|varchar|bytea)/i);
});
