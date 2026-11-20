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
 const page=read("app/connections/page.tsx");
 assert.match(hub,/duplicateMetaAppId\(/);
 assert.match(hub,/provider==="instagram_professional"&&duplicatedInstagramId/);
 assert.match(page,/setup\?\.duplicateAppId/);
 assert.match(page,/meta\.duplicateAppId/);
 assert.doesNotMatch(hub,/clientSecret:|sealed_client_secret:|encrypted_access_token:/);
});
