import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
// Compile the actual pure TypeScript source, not a duplicated JavaScript test implementation.
async function runtime(path){
 const source=readFileSync(new URL("../ghl-gpt-gateway/lib/"+path,import.meta.url),"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
 return import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
}
const data=await runtime("reach-command-data.ts");
const layout=await runtime("reach-command-contract.ts");
const sql=await runtime("reach-command-layout-sql.ts");
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const workspaces={configured:true,workspaces:[{id:a,name:"Synthetic Alpha",slug:"alpha"},{id:b,name:"Synthetic Beta",slug:"beta"}]};
const insights={workspaceId:a,internalOnly:true,drafts:{draft:2,planned:1,approved:3},
 scheduledNextSevenDays:2,overdueApproved:1,metricsAvailable:false,externalReach:null,externalEngagement:null};
const monitor={workspaceId:a,externalPublishing:false,autoRecoveryEnabled:false,
 summary:{queuedOverHour:1,leasesOverdue:0,retryScheduled:1,retryExhausted:0,readyPending:2,outdatedRevision:0,attention:1}};
const providers={workspaceId:a,publishingEnabled:false,realMetricsAvailable:false,
 connections:[{id:"facebook",name:"Facebook Pages",connectionStatus:"missing_config",connectedAccounts:0,publishingEnabled:false},
  {id:"instagram",name:"Instagram Professional",connectionStatus:"read_only",connectedAccounts:1,publishingEnabled:false}]};
test("actual runtime workspace parser accepts synthetic owner workspaces only",()=>{
 assert.equal(data.parseCommandWorkspaces(workspaces).length,2);
 assert.throws(()=>data.parseCommandWorkspaces({...workspaces,workspaces:[workspaces.workspaces[0],workspaces.workspaces[0]]}),/Invalid staging data/);
 assert.throws(()=>data.parseCommandWorkspaces({...workspaces,configured:false}),/Invalid staging data/);
 assert.throws(()=>data.parseCommandWorkspaces({...workspaces,workspaces:[{id:"not-a-uuid",name:"Bad",slug:"bad"}]}),/Invalid staging data/);
});
test("internal social counts parse exactly and never invent external analytics",()=>{
 const x=data.parseCommandInsights(insights,a);
 assert.equal(x.drafts.draft,2);
 assert.equal(x.scheduledNextSevenDays,2);
 assert.equal(x.externalReach,null);
 assert.throws(()=>data.parseCommandInsights(insights,b),/Invalid staging data/);
 assert.throws(()=>data.parseCommandInsights({...insights,drafts:{draft:-1,planned:1,approved:3}},a),/Invalid staging data/);
 assert.throws(()=>data.parseCommandInsights({...insights,externalReach:2500},a),/Invalid staging data/);
 assert.throws(()=>data.parseCommandInsights({...insights,metricsAvailable:true},a),/Invalid staging data/);
});
test("delivery monitor rejects wrong tenant or claimed external publishing",()=>{
 assert.equal(data.parseCommandMonitor(monitor,a).summary.attention,1);
 assert.throws(()=>data.parseCommandMonitor(monitor,b),/Invalid staging data/);
 assert.throws(()=>data.parseCommandMonitor({...monitor,externalPublishing:true},a),/Invalid staging data/);
 assert.throws(()=>data.parseCommandMonitor({...monitor,summary:{...monitor.summary,attention:"1"}},a),/Invalid staging data/);
});
test("provider inventory requires genuine read-only status for nonzero counts",()=>{
 const x=data.parseCommandProviders(providers,a);
 assert.equal(x.connections[1].connectedAccounts,1);
 assert.throws(()=>data.parseCommandProviders({...providers,workspaceId:b},a),/Invalid staging data/);
 assert.throws(()=>data.parseCommandProviders({...providers,connections:[{...providers.connections[0],connectedAccounts:1}]},a),/Invalid staging data/);
 assert.throws(()=>data.parseCommandProviders({...providers,publishingEnabled:true},a),/Invalid staging data/);
 assert.throws(()=>data.parseCommandProviders({...providers,connections:[providers.connections[0],providers.connections[0]]},a),/Invalid staging data/);
});
test("API loader parses synthetic HTTP responses and preserves authentication failures",async()=>{
 const ac=new AbortController();
 const fake=async()=>new Response(JSON.stringify(insights),{status:200,headers:{"content-type":"application/json"}});
 const result=await data.loadCommandJson("/api/test",ac.signal,v=>data.parseCommandInsights(v,a),fake);
 assert.equal(result.drafts.approved,3);
 await assert.rejects(data.loadCommandJson("/api/test",ac.signal,x=>x,async()=>new Response("{}",{status:401})),e=>e.status===401);
 await assert.rejects(data.loadCommandJson("/api/test",ac.signal,x=>x,async()=>new Response("broken",{status:200})),e=>e.status===422);
 await assert.rejects(data.loadCommandJson("/api/test",ac.signal,x=>x,async()=>{throw Error("offline")}),e=>e.status===0);
});
test("error states resolve to an actionable outcome, not a fabricated all-clear",()=>{
 assert.equal(data.commandErrorInfo(new data.CommandDataError(401,"Unauthorized")).action,"sign_in");
 assert.equal(data.commandErrorInfo(new data.CommandDataError(403,"Disabled")).action,"configure");
 assert.equal(data.commandErrorInfo(new data.CommandDataError(404,"Not found")).action,"select_workspace");
 assert.equal(data.commandErrorInfo(new data.CommandDataError(503,"Unavailable")).action,"retry");
});
test("runtime widget schema rejects duplicates, unexpected fields and injection payloads",()=>{
 const accepted=layout.parseCommandLayout(layout.DEFAULT_COMMAND_LAYOUT);
 assert.deepEqual(accepted.order,layout.COMMAND_WIDGET_IDS);
 assert.equal(layout.parseCommandLayout({...accepted,extra:"unsafe"}),null);
 assert.equal(layout.parseCommandLayout({...accepted,hidden:["readiness","readiness"]}),null);
 assert.equal(layout.parseCommandLayout({...accepted,order:[...accepted.order.slice(0,-1),"not-a-widget"]}),null);
 assert.equal(layout.parseCommandLayout({...accepted,wide:{"__proto__":true}}),null);
});
test("SQL splits atomic first insertion from revision CAS and audits only changed rows",()=>{
 const first=sql.commandLayoutStatement(0),later=sql.commandLayoutStatement(1);
 assert.match(first,/INSERT INTO agency_reach_command_layouts/);
 assert.match(first,/ON CONFLICT\(workspace_id\) DO NOTHING/);
 assert.doesNotMatch(first,/DO UPDATE/);
 assert.match(later,/UPDATE agency_reach_command_layouts/);
 assert.match(later,/WHERE workspace_id=\$1::uuid AND revision=\$3::int/);
 assert.doesNotMatch(later,/INSERT INTO agency_reach_command_layouts/);
 for(const value of [first,later]){
  assert.match(value,/reach\.dashboard\.layout_saved/);
  assert.match(value,/SELECT workspace_id,'reach\.dashboard\.layout_saved'/);
  assert.match(value,/RETURNING workspace_id,revision/);
  assert.doesNotMatch(value,/access_token|client_secret|password/);
 }
});

test("staging storage preflight is a strict synthetic contract",()=>{
 assert.deepEqual(data.parseCommandReadiness({isolatedStorageApproved:true,layoutWritesEnabled:false}),{
  isolatedStorageApproved:true,layoutWritesEnabled:false
 });
 assert.throws(()=>data.parseCommandReadiness({isolatedStorageApproved:false,layoutWritesEnabled:false}),/Invalid staging storage approval/);
 assert.throws(()=>data.parseCommandReadiness({isolatedStorageApproved:true,layoutWritesEnabled:"true"}),/Invalid staging storage approval/);
 assert.deepEqual(data.commandErrorInfo(new data.CommandDataError(428,"Not approved")),{message:
  "Isolated staging database approval is required before any workspace data can be read.",action:"configure"});
});
