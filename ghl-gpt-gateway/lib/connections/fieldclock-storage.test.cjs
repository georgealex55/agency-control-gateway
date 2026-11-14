'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'../..');
const src=file=>fs.readFileSync(path.join(base,file),'utf8');
const db=src('lib/connections/fieldclock-db.ts');
const status=src('app/api/reach/personal/storage/route.ts');
const records=src('app/api/reach/personal/records/route.ts');
const ui=src('app/reach-connections/page.tsx');
const schema=src('db/staging/20261114_fieldclock_reach_personal_storage.sql');
test('Fieldclock connection is pinned to the authorized project, branch, host, database and restricted role',()=>{
 for(const value of ['lively-morning-77987546','br-shiny-river-av8dqh2j','ep-wispy-shape-avlihp8l-pooler.c-11.us-east-1.aws.neon.tech','neondb','reach_personal_runtime'])assert.ok(db.includes(value));
 assert.match(db,/REACH_PERSONAL_DATABASE_URL/);
 assert.match(db,/REACH_PERSONAL_WORKSPACE_ID/);
 assert.doesNotMatch(db,/process\.env\.DATABASE_URL\b/);
});
test('Live connection status is a read-only database probe, never a configured flag',()=>{
 assert.match(status,/checkPersonalDb\(/);
 assert.match(db,/SELECT current_database\(\)/);
 assert.match(status,/externalActionsEnabled:false/);
 assert.doesNotMatch(status,/INSERT|UPDATE|DELETE/i);
});
test('record access requires Neon owner validation, same origin and explicit approval',()=>{
 assert.match(records,/verifyPersonalNeonOwner\(/);
 assert.match(records,/req\.headers\.get\("origin"\)!==req\.nextUrl\.origin/);
 assert.match(records,/data\.approved!==true/);
 assert.match(records,/RECORD_KINDS\.includes/);
 assert.match(db,/set_config\('reach.workspace_id'/);
 assert.match(db,/ON CONFLICT \(workspace_id,request_id\) DO NOTHING/);
});
test('app does not collect auth credentials while Neon Auth is pending',()=>{
 assert.match(ui,/Save record · Activate Neon Auth first/);
 assert.match(ui,/disabled/);
 assert.doesNotMatch(ui,/createAuthClient|type="password"|Authorization.*Bearer/);
});
test('schema has forced RLS, tenant writes, and idempotent record saves',()=>{
 assert.match(schema,/FORCE ROW LEVEL SECURITY/g);
 assert.match(schema,/WITH CHECK \(workspace_id/);
 assert.match(schema,/UNIQUE INDEX IF NOT EXISTS personal_record_idempotency/);
 assert.doesNotMatch(schema,/DROP TABLE public\./);
});
