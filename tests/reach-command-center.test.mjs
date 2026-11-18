import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("ghl-gpt-gateway/app/reach-command-center.tsx");
const contract=read("ghl-gpt-gateway/lib/reach-command-contract.ts");
const store=read("ghl-gpt-gateway/lib/reach-command-layout-store.ts");
const api=read("ghl-gpt-gateway/app/api/platform/command-center/layout/route.ts");
const socialContract=read("ghl-gpt-gateway/lib/social-contract.ts");
const data=read("ghl-gpt-gateway/lib/reach-command-data.ts");
const sql=read("ghl-gpt-gateway/lib/reach-command-layout-sql.ts");
const page=read("ghl-gpt-gateway/app/page.tsx");
const readiness=read("ghl-gpt-gateway/app/api/platform/command-center/readiness/route.ts");
const workspacesRoute=read("ghl-gpt-gateway/app/api/platform/workspaces/route.ts");
const socialGate=read("ghl-gpt-gateway/lib/social-api.ts");
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
 assert.match(ui,/loadCommandJson\("\/api\/platform\/workspaces",controller\.signal,parseCommandWorkspaces\)/);
 assert.match(ui,/setWorkspaceId\(old=>list\.some\(w=>w\.id===old\)/);
 assert.match(data,/credentials:"same-origin",cache:"no-store",signal/);
 assert.match(ui,/const controller=new AbortController\(\)/);
 assert.match(ui,/return \(\)=>controller\.abort\(\)/);
});
test("data widgets fetch real selected-workspace social and delivery records",()=>{
 for(const path of ["/api/platform/social/insights","/api/platform/social/monitor","/api/platform/social/providers"]){
  assert.ok(ui.includes('"'+path+'"'));
 }
 assert.match(ui,/parseCommandInsights\(raw,workspaceId\)/);
 assert.match(ui,/parseCommandMonitor\(raw,workspaceId\)/);
 assert.match(ui,/parseCommandProviders\(raw,workspaceId\)/);
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
 assert.match(store,/readCommandLayoutRow\(run,workspaceId,writesEnabled\)/);
 assert.match(sql,/COMMAND_LAYOUT_TABLE_EXISTS_SQL/);
 assert.match(sql,/if\(!table\?\.table_name\)return null/);
});
test("revision-safe persistence is scoped to a stored workspace and audited",()=>{
 assert.match(store,/WHERE id=\$1::uuid LIMIT 1/);
 assert.match(sql,/workspace_id UUID PRIMARY KEY REFERENCES agency_platform_workspaces/);
 assert.match(sql,/WHERE workspace_id=\$1::uuid AND revision=\$3::int/);
 assert.match(sql,/ON CONFLICT\(workspace_id\) DO NOTHING/);
 assert.match(sql,/commandLayoutStatement\(expectedRevision\)/);
 assert.match(store,/persistCommandLayoutRow\(run,workspaceId,JSON\.stringify\(layout\),expectedRevision\)/);
 assert.match(sql,/reach\.dashboard\.layout_saved/);
 assert.match(store,/if\(revision===null\)return \{status:"conflict"/);
 assert.match(api,/status==="conflict".+409/);
});
test("existing social studio remains restricted to named staging branch and explicit flag",()=>{
 assert.match(socialContract,/experiment\/reach-23-ui-redesign-staging-20261115/);
 assert.match(socialContract,/env\.VERCEL_ENV==="preview"/);
 assert.match(socialContract,/env\.SOCIAL_STAGING_ENABLED==="true"/);
});

test("separate refresh paths preserve unsaved layouts and allow explicit reload",()=>{
 assert.match(ui,/const \[layoutReload,setLayoutReload\]=useState\(0\)/);
 assert.match(ui,/const \[refreshKey,setRefreshKey\]=useState\(0\)/);
 assert.match(ui,/},\[workspaceId,authenticated,refreshKey\]\);/);
 assert.match(ui,/},\[workspaceId,authenticated,layoutReload\]\);/);
 assert.match(ui,/Reload saved layout/);
 assert.match(ui,/Another session changed this layout/);
});
test("invalid workspace responses clear privileged UI and expose explicit retries",()=>{
 assert.match(page,/onUnauthorized=\{\(\)=>setSession\(s=>\(\{\.\.\.s,authenticated:false\}\)\)\}/);
 assert.match(ui,/e instanceof CommandDataError&&e.status===401/);
 assert.match(ui,/Retry workspaces/);
 assert.match(ui,/Retry data/);
 assert.match(ui,/No verified data loaded/);
 assert.match(data,/raw\.workspaceId===workspaceId/);
});

test("dashboard checks isolated database readiness BEFORE reading workspaces",()=>{
 assert.match(ui,/loadCommandJson\("\/api\/platform\/command-center\/readiness",controller\.signal,parseCommandReadiness\)/);
 assert.match(ui,/\.then\(\(\)=>loadCommandJson\("\/api\/platform\/workspaces"/);
 assert.match(ui,/Review owner setup/);
});
test("no accidental global database access without separate staging approval",()=>{
 assert.match(store,/REACH_COMMAND_ISOLATED_STORAGE_ENABLED!=="true"/);
 assert.match(store,/REACH_COMMAND_APPROVED_DATABASE_SHA256/);
 assert.match(store,/createHash\("sha256"\)/);
 assert.match(store,/timingSafeEqual/);
 assert.match(store,/!commandApprovedStorageConfigured\(\)\)return null/);
 assert.match(store,/return commandApprovedStorageConfigured\(\)&&process\.env\.REACH_COMMAND_LAYOUT_WRITES_ENABLED==="true"/);
 assert.match(readiness,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(readiness,/if\(!commandApprovedStorageConfigured\(\)\)/);
 assert.match(api,/if\(!commandApprovedStorageConfigured\(\)\)/);
 assert.doesNotMatch(readiness,/readySql\(|process\.env\.AGENCY_PLATFORM_DATABASE_URL/);
});

test("underlying staging workspace and social endpoints reject unapproved database even if directly called",()=>{
 assert.match(workspacesRoute,/if\(commandIsReach23Branch\(\)&&!commandApprovedStorageConfigured\(\)\)return reply/);
 assert.match(socialGate,/if\(commandIsReach23Branch\(\)&&!commandApprovedStorageConfigured\(\)\)return reply/);
 assert.match(store,/export function commandIsReach23Branch\(\)/);
 assert.match(store,/process\.env\.VERCEL_ENV==="preview"&&commandIsReach23Branch\(\)/);
 assert.match(workspacesRoute,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(socialGate,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(workspacesRoute,/if\(!sameOrigin\(req\)\)/);
 assert.match(socialGate,/if\(write&&!sameOrigin\(req\)\)/);
});
