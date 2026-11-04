import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ENGINES,UPSTREAM_ENGINES,publicOrigin,engineSetup} from "../ghl-gpt-gateway/lib/upstream-engine-contract.ts";
const w="8bba25e1-dc8e-4601-8bf2-91092f097bcc",other="bccf663f-097d-4324-a155-963b08eadb30";
test("all five original upstream engines are registered, each with an explicit source",()=>{
 assert.deepEqual(UPSTREAM_ENGINES,["website","learning","crm","social","automation"]);
 for(const id of UPSTREAM_ENGINES){assert(ENGINES[id].source.includes("/"));assert(ENGINES[id].setupKeys.length>=4);}
 assert.equal(ENGINES.website.doctype,"Builder Page");
 assert.equal(ENGINES.learning.doctype,"LMS Course");
 assert.equal(ENGINES.crm.doctype,"CRM Lead");
});
test("service base URL is a clean public HTTPS origin, not an arbitrary URL",()=>{
 assert.equal(publicOrigin("https://studio.example.com/"),"https://studio.example.com");
 for(const bad of ["http://studio.example.com","https://localhost/","https://127.0.0.1/","https://10.1.2.3/","https://192.168.2.1/","https://169.254.169.254/","https://foo.internal/","https://foo.example.com/admin","https://u:p@studio.example.com/","https://studio.example.com/?a=b","https://[::1]/"]){
  assert.throws(()=>publicOrigin(bad),bad);
 }
});
test("upstream configuration is restricted to the exact selected workspace and hides secrets",()=>{
 const env={UPSTREAM_FRAPPE_BASE_URL:"https://frappe.example.com",UPSTREAM_FRAPPE_API_KEY:"SECRET_KEY",UPSTREAM_FRAPPE_API_SECRET:"SECRET_SECRET",UPSTREAM_FRAPPE_WORKSPACE_ID:w,
  SOCIAL_POSTIZ_BASE_URL:"https://postiz.example.com",SOCIAL_POSTIZ_API_KEY:"SECRET_POSTIZ",SOCIAL_POSTIZ_ORG_ID:"org123",SOCIAL_POSTIZ_WORKSPACE_ID:w,
  UPSTREAM_ACTIVEPIECES_BASE_URL:"https://flows.example.com",UPSTREAM_ACTIVEPIECES_API_KEY:"SECRET_AUTOMATION",UPSTREAM_ACTIVEPIECES_PROJECT_ID:"a".repeat(21),UPSTREAM_ACTIVEPIECES_WORKSPACE_ID:w};
 for(const id of UPSTREAM_ENGINES){
  const a=engineSetup(env,id,w);
  assert.equal(a.configured,true,id);
  assert.equal(a.workspaceBound,true);
  assert.equal(a.readOnly,true);
  assert(!JSON.stringify(a).includes("SECRET_"),id);
  const b=engineSetup(env,id,other);
  assert.equal(b.configured,false,id);
  assert.equal(b.workspaceBound,false);
 }
});
test("engine check endpoints require single administrator and same-origin staging gate",()=>{
 const inventory=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/engines/route.ts",import.meta.url),"utf8");
 const check=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/engines/check/route.ts",import.meta.url),"utf8");
 assert(inventory.includes("gate(req)"));
 assert(check.includes("gate(req,true)"));
 assert(check.includes("workspaceFromQuery")===false);
 assert(check.includes("SELECT id FROM agency_platform_workspaces"));
 assert(check.includes("upstream.engine.checked"));
 const adapter=readFileSync(new URL("../ghl-gpt-gateway/lib/upstream-engine-readers.ts",import.meta.url),"utf8");
 assert(adapter.includes('method:"GET"'));
 assert(adapter.includes('redirect:"error"'));
 assert(!adapter.includes('method:"POST"'));
 assert(adapter.includes("/api/method/frappe.auth.get_logged_user"));
 assert(adapter.includes("/api/v1/flows?projectId="));
 assert(adapter.includes("readPostizStage(workspaceId)"));
});
