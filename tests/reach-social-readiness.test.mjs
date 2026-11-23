import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");

test("customer Connections offers direct social OAuth without any developer app controls",()=>{
 const page=read("app/connections/page.tsx");
 assert.match(page,/Connect "\+p\.name/);
 assert.match(page,/Reconnect "\+p\.name/);
 assert.match(page,/start\(p\.id as "facebook"\|"instagram"\)/);
 assert.match(page,/Verify/);
 assert.match(page,/Disconnect/);
 assert.match(page,/Only a successfully completed provider OAuth and verified stored account record/);
 assert.match(page,/No developer app credentials are required/);
 for(const hidden of [
  "SocialReadiness","meta-app-id-","meta-app-secret-","clientSecret:","missingSettings",
  "callbackUrl","duplicateAppId","Developer settings needed","Developer settings required",
  "p.appSetup","SOCIAL_META_FACEBOOK_CLIENT_SECRET"
 ])assert.ok(!page.includes(hidden),"Customer must not contain "+hidden);
 assert.doesNotMatch(page,/localStorage|sessionStorage|\/api\/platform\/social\/dispatch|publishPost|sendMessage/);
});

test("developer console requires owner session and contains isolated credentials, separate from customers",()=>{
 const server=read("app/developer/meta/page.tsx");
 const admin=read("app/developer/meta/developer-meta-console.tsx");
 const route=read("app/api/reach/developer/meta-status/route.ts");
 const ui=read("app/connections/social-readiness.tsx");
 assert.match(server,/await cookies\(\)/);
 assert.match(server,/validSession\(jar\.get\(cookieName\(\)\)\?\.value\)/);
 assert.match(server,/redirect\("\/login\?next=%2Fdeveloper%2Fmeta"\)/);
 assert.match(admin,/SocialReadiness meta=\{status\.meta\}/);
 assert.match(admin,/\/api\/reach\/developer\/meta-status/);
 assert.match(route,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(route,/missingSettings:state\.missingSettings/);
 assert.match(route,/callbackUrl:state\.callbackUrl/);
 assert.match(route,/duplicateAppId:/);
 assert.match(ui,/STEP 2A · FACEBOOK CONNECTION/);
 assert.match(ui,/STEP 2B · INSTAGRAM CONNECTION/);
 assert.match(ui,/reach-meta-setup-/);
 assert.match(ui,/connectedAccounts\[item\.provider\]/);
 assert.match(ui,/working\[item\.provider\]/);
 assert.match(ui,/body:JSON\.stringify\(\{provider,clientId:id,clientSecret:secret\}\)/);
 assert.match(ui,/Missing developer configuration/);
 assert.match(ui,/Publishing & messaging/);
 assert.match(ui,/Disabled/);
 assert.match(ui,/API setup with Unified login/);
 assert.match(ui,/Instagram-specific App ID \(if available\)/);
 assert.match(ui,/developers\.facebook\.com\/apps\//);
 assert.doesNotMatch(ui,/SOCIAL_META_FACEBOOK_CLIENT_SECRET=|SOCIAL_META_INSTAGRAM_CLIENT_SECRET=|console\.log|localStorage/);
});

test("customer hub returns only provider capability and never app IDs, secrets, callback or setup keys",()=>{
 const hub=read("app/api/reach/connection-hub/route.ts");
 assert.match(hub,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(hub,/const customerMeta=meta\.map/);
 assert.match(hub,/meta:customerMeta/);
 assert.match(hub,/requiredSetup:\["Social connections are not available/);
 assert.doesNotMatch(hub,/client_secret:|access_token:|tokenValue/);
 assert.match(hub,/externalMessagingEnabled:false/);
 const developer=read("app/api/reach/developer/meta-status/route.ts");
 assert.match(developer,/resolvedMetaEnv/);
 assert.match(developer,/developerOnly:true/);
});

test("valid identical Meta App IDs are detected only as Instagram Direct Login incompatibility",async()=>{
 const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
 const ts=require("typescript");
 const source=read("lib/social-meta-contract.ts");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {duplicateMetaAppId}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
 assert.equal(duplicateMetaAppId("123456789123","123456789123"),true);
 assert.equal(duplicateMetaAppId("123456789123","123456789124"),false);
 for(const [a,b] of [["",""],[undefined,undefined],["not-an-id","not-an-id"],["123456789123",null]])assert.equal(duplicateMetaAppId(a,b),false);
 const start=read("app/api/platform/social/meta/start/route.ts");
 assert.match(start,/duplicateMetaAppId\(/);
 assert.match(start,/Instagram Direct Login cannot authorize/);
 assert.match(start,/Unified Login/);
});

test("Facebook and Instagram OAuth maintain separate nonce cookies and provider-bound consent",()=>{
 const start=read("app/api/platform/social/meta/start/route.ts");
 const callback=read("app/api/platform/social/meta/callback/route.ts");
 const crypto=read("lib/social-meta-crypto.ts");
 assert.match(start,/response\.cookies\.set\("agency_meta_nonce_"\+input\.provider,nonce/);
 assert.match(callback,/req\.cookies\.get\("agency_meta_nonce_"\+parsed\.provider\)/);
 assert.match(callback,/if\(provider\)response\.cookies\.set\("agency_meta_nonce_"\+provider/);
 assert.match(callback,/sameNonce\(cookie,parsed\.nonce\)/);
 assert.match(callback,/consumeMetaFlow\(parsed\.workspaceId,parsed\.provider,parsed\.nonce\)/);
 assert.match(crypto,/createHmac\("sha256",secret\)/);
 assert.doesNotMatch(callback,/req\.cookies\.get\("agency_meta_nonce"\)/);
});
