import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
test("Meta store routes every operation through owner workspace scoped SQL",()=>{
 const s=read("lib/social-meta-connection-store.ts");
 assert.doesNotMatch(s,/await readySql\(\)/);
 assert.equal((s.match(/socialMetaWorkspaceDb\(workspaceId\)/g)||[]).length,8);
});
test("tenant context uses one SQL transaction per operation and rejects mismatched workspace",()=>{
 const s=read("lib/reach-social-owner-db.ts");
 assert.match(s,/workspaceId!==process\.env\.REACH_SOCIAL_OWNER_WORKSPACE_ID/);
 assert.match(s,/set_config\('reach\.workspace_id'/);
 assert.match(s,/sql\.transaction\(/);
 assert.match(s,/u\.username==="reach_app_runtime"/);
 assert.doesNotMatch(s,/AGENCY_PLATFORM_DATABASE_URL/);
});
test("production gate may use approved social storage without changing legacy gate",()=>{
 const s=read("lib/reach-connection-runtime.ts");
 assert.match(s,/ownerSocialStorageConfigured\(env\)\|\|productionConnectionApproved\(env\)/);
 const hub=read("app/api/reach/connection-hub/route.ts");
 assert.match(hub,/ownerSocialWorkspace\(\)/);
 assert.match(hub,/if\(!adminAuthenticated\(req\)\)/);
});
test("no publishing or messaging permission added in social schema",()=>{
 for(let i=1;i<=6;i++){
  const p="db/reach23-core/V00"+i+"__"+["workspace_core","command_layouts","meta_connections","runtime_grants_rls","encrypted_neon_connections","meta_consent_gates"][i-1]+".sql";
  const s=read(p);
  assert.doesNotMatch(s,/DROP TABLE|TRUNCATE|GRANT .*BYPASSRLS/i);
 }
 const state=read("app/connections/social-readiness.tsx");
 assert.match(state,/Publishing & messaging/);
 assert.match(state,/Disabled/);
});
test("new TS files parse without syntax diagnostics",()=>{
 for(const path of ["lib/reach-social-owner-db.ts","lib/social-meta-connection-store.ts","lib/reach-connection-runtime.ts","app/api/reach/connection-hub/route.ts"]){
  const result=ts.transpileModule(read(path),{fileName:path,reportDiagnostics:true,
   compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,path);
 }
});
