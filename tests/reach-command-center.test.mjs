import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("ghl-gpt-gateway/app/reach-command-center.tsx");
const contract=read("ghl-gpt-gateway/lib/reach-command-contract.ts");
const store=read("ghl-gpt-gateway/lib/reach-command-layout-store.ts");
const api=read("ghl-gpt-gateway/app/api/platform/command-center/layout/route.ts");
const socialContract=read("ghl-gpt-gateway/lib/social-contract.ts");
const widgets=["readiness","social","connections","delivery","actions","shortcuts","roadmap"];
test("command center lists seven distinct functional owner widgets",()=>{
 const match=contract.match(/COMMAND_WIDGET_IDS=\[([^\]]+)\]/);
 assert.ok(match);
 const ids=[...match[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(ids,widgets);
 for(const id of ids)assert.ok(ui.includes('id==="'+id+'"'));
});
test("workspace inventory is authenticated and selected before data loads",()=>{
 assert.match(ui,/if\(!authenticated\)\{setWorkspaces\(\[\]\);setWorkspaceId\(""\)/);
 assert.match(ui,/getJson<\{workspaces:Workspace\[\]\}>\("\/api\/platform\/workspaces"/);
 assert.match(ui,/setWorkspaceId\(old=>list\.some\(w=>w\.id===old\)/);
 assert.match(ui,/credentials:"same-origin",cache:"no-store",signal/);
 assert.match(ui,/const controller=new AbortController\(\)/);
 assert.match(ui,/return \(\)=>controller\.abort\(\)/);
});
test("data widgets fetch real selected-workspace social and delivery records",()=>{
 for(const path of ["/api/platform/social/insights","/api/platform/social/monitor","/api/platform/social/providers"]){
  assert.ok(ui.includes('"'+path+'"'));
 }
 assert.match(ui,/value\.workspaceId!==workspaceId/);
 assert.match(ui,/setFeedErrors\(p=>/);
 assert.match(ui,/setFeedsLoading\(true\)/);
 assert.match(ui,/insights\?\.drafts\.draft/);
 assert.match(ui,/insights\?\.scheduledNextSevenDays/);
 assert.match(ui,/monitor\?\.summary\.attention/);
 assert.match(ui,/typeof n==="number"&&Number\.isFinite\(n\)\?n\.toLocaleString\(\):"—"/);
});
test("no external publishing, fabricated money metrics or enabled unbuilt actions",()=>{
 assert.doesNotMatch(ui,/\/api\/platform\/social\/dispatch|sendMessage\(|publishPost\(/);
 assert.match(ui,/External reach, revenue and engagement metrics are not collected/);
 assert.match(ui,/External publishing remains disabled/);
 assert.match(ui,/disabled title="Requires verified owner data access"/);
 assert.match(ui,/disabled title="No external communication is enabled"/);
});
test("layout schema rejects arbitrary widgets, unknown fields and duplicate IDs",()=>{
 assert.match(contract,/const allowed=new Set<string>\(COMMAND_WIDGET_IDS\)/);
 assert.match(contract,/new Set\(value\)\.size===value\.length/);
 assert.match(contract,/Object\.keys\(x\)\.some\(k=>!\["order","hidden","wide"\]\.includes\(k\)\)/);
 assert.match(contract,/order\.length!==COMMAND_WIDGET_IDS\.length/);
 assert.match(contract,/COMMAND_WIDGET_IDS\.every\(id=>order\.includes\(id\)\)/);
 assert.match(contract,/uniqueWidgetList\(hidden\)/);
 assert.match(contract,/uniqueWidgetList\(wide\)/);
});
test("owner layout endpoint denies unauthenticated, wrong-origin and non-staging writes",()=>{
 assert.match(api,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(api,/if\(!commandLayoutStage\(\)\)/);
 assert.match(api,/write&&!sameOrigin\(req\)/);
 assert.match(api,/if\(!validWorkspaceId\(workspaceId\)\)/);
 assert.match(api,/Cache-Control":"private, no-store"/);
 assert.match(api,/if\(Number\(req\.headers\.get\("content-length"\)\|\|0\)>4096\)/);
});
test("database opt-in and branch isolation prevent involuntary layout writes",()=>{
 assert.match(store,/process\.env\.VERCEL_ENV==="preview"/);
 assert.match(store,/process\.env\.VERCEL_GIT_COMMIT_REF==="experiment\/reach-23-ui-redesign-staging-20261115"/);
 assert.match(store,/process\.env\.REACH_COMMAND_LAYOUT_WRITES_ENABLED==="true"/);
 assert.match(store,/if\(!commandLayoutWritesEnabled\(\)\)return \{status:"disabled"/);
 assert.match(store,/if\(!commandLayoutWritesEnabled\(\)\)return \{found:true,layout:DEFAULT_COMMAND_LAYOUT/);
});
test("revision-safe persistence is scoped to a stored workspace and audited",()=>{
 assert.match(store,/WHERE id=\$1::uuid LIMIT 1/);
 assert.match(store,/workspace_id UUID PRIMARY KEY REFERENCES agency_platform_workspaces/);
 assert.match(store,/WHERE agency_reach_command_layouts\.revision=\$3::int/);
 assert.match(store,/ON CONFLICT\(workspace_id\) DO UPDATE/);
 assert.match(store,/reach\.dashboard\.layout_saved/);
 assert.match(store,/if\(!result\.length\)return \{status:"conflict"/);
 assert.match(api,/status==="conflict".+409/);
});
test("existing social studio remains restricted to named staging branch and explicit flag",()=>{
 assert.match(socialContract,/experiment\/reach-23-ui-redesign-staging-20261115/);
 assert.match(socialContract,/env\.VERCEL_ENV==="preview"/);
 assert.match(socialContract,/env\.SOCIAL_STAGING_ENABLED==="true"/);
});
