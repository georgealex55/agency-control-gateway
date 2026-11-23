import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
test("Meta social readiness connects to exact hub status, never treats setup as connected",()=>{
 const page=read("app/connections/page.tsx"),ui=read("app/connections/social-readiness.tsx");
 assert.match(page,/SocialReadiness meta=\{hub.meta\} storageApproved=\{hub.storageApproved\} onConfigured=/);
 assert.match(ui,/item\.launchEnabled/);
 assert.match(ui,/storageApproved/);
 assert.match(ui,/Missing developer configuration/);
 assert.match(ui,/reach-meta-setup-/);
 assert.match(ui,/Start here: enter your developer App ID and Secret/);
 assert.match(ui,/Publishing & messaging/);
 assert.match(ui,/Disabled/);
 assert.match(ui,/api\/platform\/social\/meta\/callback/);
 assert.match(ui,/item\.duplicateAppId/);
 assert.match(ui,/Instagram App ID and matching Instagram App Secret/);
 assert.match(ui,/developers\.facebook\.com\/apps\//);
 assert.doesNotMatch(ui,/SOCIAL_META_FACEBOOK_CLIENT_SECRET=|SOCIAL_META_INSTAGRAM_CLIENT_SECRET=|console\.log|localStorage/);
});

test("identical valid Meta app IDs are a safe, actionable Instagram blocker",async()=>{
 const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
 const ts=require("typescript");
 const source=read("lib/social-meta-contract.ts");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {duplicateMetaAppId}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
 assert.equal(duplicateMetaAppId("123456789123","123456789123"),true);
 assert.equal(duplicateMetaAppId("123456789123","123456789124"),false);
 for(const [a,b] of [["",""],[undefined,undefined],["not-a-valid-id","not-a-valid-id"],["123456789123",null]]){
  assert.equal(duplicateMetaAppId(a,b),false);
 }
 const hub=read("app/api/reach/connection-hub/route.ts");
 const start=read("app/api/platform/social/meta/start/route.ts");
 const page=read("app/connections/page.tsx");
 assert.match(hub,/duplicateMetaAppId\(/);
 assert.match(hub,/provider==="instagram_professional"&&duplicatedInstagramId/);
 assert.match(page,/setup\?\.duplicateAppId/);
 assert.match(page,/meta\.duplicateAppId/);
 assert.match(start,/duplicateMetaAppId\(/);
 assert.match(start,/Instagram Direct Login cannot authorize/);
 assert.match(start,/Unified Login/);
 assert.doesNotMatch(hub,/clientSecret:|sealed_client_secret:|encrypted_access_token:/);
});

test("Facebook and Instagram have independent setup, credentials, account inventory and actions",()=>{
 const ui=read("app/connections/social-readiness.tsx");
 const page=read("app/connections/page.tsx");
 const vault=read("lib/reach-meta-app-vault.ts");
 const server=read("app/api/reach/connections/meta-apps/route.ts");
 const store=read("lib/social-meta-connection-store.ts");
 for(const marker of ["STEP 2A · FACEBOOK CONNECTION","STEP 2B · INSTAGRAM CONNECTION",
  "reach-social-heading-","reach-meta-setup-","reach-provider-"])assert.ok((ui+page).includes(marker),marker);
 assert.match(ui,/connectedAccounts\[item\.provider\]/);
 assert.match(ui,/working\[item\.provider\]/);
 assert.match(ui,/setMessage\(old=>\(\{\.\.\.old,\[provider\]/);
 assert.match(ui,/setError\(old=>\(\{\.\.\.old,\[provider\]/);
 assert.match(ui,/body:JSON\.stringify\(\{provider,clientId:id,clientSecret:secret\}\)/);
 assert.match(page,/c\.provider==="facebook_pages"/);
 assert.match(page,/c\.provider==="instagram_professional"/);
 assert.match(page,/id=\{"reach-provider-"\+p\.id\}/);
 assert.match(vault,/reach-vault:primary-owner:meta-app:/);
 assert.match(vault,/WHERE owner_key=\$1 AND provider=\$2/);
 assert.match(server,/!isMetaProvider\(p\.provider\)/);
 assert.match(store,/ON CONFLICT\(workspace_id,provider,provider_account_id\)/);
 assert.match(store,/WHERE workspace_id=\$1::uuid AND id=\$2::uuid/);
 assert.match(ui,/API setup with Unified login/);
 assert.match(ui,/One callback endpoint is safe/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|console\.log/);
});
