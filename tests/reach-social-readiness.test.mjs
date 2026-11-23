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

test("Instagram Unified Login requires deliberate config_id opt-in and never requests legacy Instagram scopes",async()=>{
 const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
 const ts=require("typescript");
 let source=read("lib/social-meta-instagram-unified.ts");
 const mockToken='const parseMetaTokenPayload=(p)=>({token:p.access_token,expiresAt:null});';
 const mockGraph='const validGraphVersion=v=>typeof v==="string"&&/^v[0-9]{1,2}\\.[0-9]{1,2}$/.test(v);';
 const mockRedirect='const validMetaRedirect=v=>{try{const u=new URL(v);return u.protocol==="https:"&&u.pathname==="/api/platform/social/meta/callback"&&!u.search&&!u.hash;}catch{return false;}};';
 assert.match(source,/import \{parseMetaTokenPayload\}/);
 assert.match(source,/import \{validGraphVersion,validMetaRedirect\}/);
 source=source.replace('import {parseMetaTokenPayload} from "./social-meta-token-lifecycle";',mockToken)
  .replace('import {validGraphVersion,validMetaRedirect} from "./social-meta-contract";',mockGraph+"\n"+mockRedirect);
 const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const api=await import("data:text/javascript;base64,"+Buffer.from(transpiled).toString("base64"));
 const empty={};
 assert.equal(api.instagramUnifiedReady(empty),false);
 assert.equal(api.instagramUnifiedReady({SOCIAL_META_INSTAGRAM_UNIFIED_ENABLED:"false",SOCIAL_META_INSTAGRAM_UNIFIED_CONFIG_ID:"123456789012"}),false);
 assert.equal(api.instagramUnifiedReady({SOCIAL_META_INSTAGRAM_UNIFIED_ENABLED:"true",SOCIAL_META_INSTAGRAM_UNIFIED_CONFIG_ID:"invalid"}),false);
 assert.equal(api.instagramUnifiedReady({SOCIAL_META_INSTAGRAM_UNIFIED_ENABLED:"true",SOCIAL_META_INSTAGRAM_UNIFIED_CONFIG_ID:"123456789012"}),true);
 const url=new URL(api.buildInstagramUnifiedAuthorizeURL({
  clientId:"123456789012",configId:"223456789012",
  redirectUri:"https://agency-control-gateway.vercel.app/api/platform/social/meta/callback",
  state:"a".repeat(64)
 }));
 assert.equal(url.origin,"https://www.facebook.com");
 assert.equal(url.pathname,"/dialog/oauth");
 assert.equal(url.searchParams.get("config_id"),"223456789012");
 assert.equal(url.searchParams.get("response_type"),"code");
 assert.equal(url.searchParams.get("state"),"a".repeat(64));
 assert.equal(url.searchParams.has("scope"),false);
 assert.equal(url.searchParams.has("access_token"),false);
 assert.throws(()=>api.buildInstagramUnifiedAuthorizeURL({
  clientId:"123456789012",configId:"invalid",
  redirectUri:"https://evil.example/api/platform/social/meta/callback?redirect=1",state:"a".repeat(64)
 }));
 const token="SYNTHETIC_BUSINESS_INTEGRATION_TOKEN_12345678";
 let exchangeCalls=0;
 const result=await api.exchangeInstagramUnifiedCode({
  code:"SYNTHETIC_CODE",clientId:"123456789012",clientSecret:"SYNTHETIC_META_SECRET",
  redirectUri:"https://agency-control-gateway.vercel.app/api/platform/social/meta/callback",version:"v27.0",
  fetcher:async (href,opts)=>{
   exchangeCalls++;
   const parsed=new URL(href);
   assert.equal(parsed.hostname,"graph.facebook.com");
   assert.equal(parsed.pathname,"/v27.0/oauth/access_token");
   assert.equal(parsed.searchParams.get("code"),"SYNTHETIC_CODE");
   assert.equal(opts.method,"GET");
   assert.equal(opts.redirect,"error");
   return new Response(JSON.stringify({access_token:token}),{status:200});
  }
 });
 assert.equal(exchangeCalls,1);
 assert.equal(result.token,token);
 assert.equal(result.expiresAt,null);
 let graphCalls=0;
 const discovered=await api.listInstagramUnifiedAccounts({
  token,version:"v27.0",fetcher:async(href,opts)=>{
   graphCalls++;
   assert.equal(new URL(href).hostname,"graph.facebook.com");
   assert.equal(opts.headers.Authorization,"Bearer "+token);
   assert.equal(opts.method,"GET");
   assert.equal(opts.redirect,"error");
   assert.equal(new URL(href).searchParams.has("access_token"),false);
   if(href.includes("assigned_instagram_accounts"))return new Response(JSON.stringify({data:[
    {id:"17841400000000001",username:"synthetic_biz"},
    {id:"17841400000000002",username:"synthetic_creator"}
   ]}),{status:200});
   return new Response(JSON.stringify({id:"99999",client_business_id:"123456789012345"}),{status:200});
  }
 });
 assert.equal(graphCalls,2);
 assert.equal(discovered.businessId,"123456789012345");
 assert.deepEqual(discovered.accounts.map(x=>x.id),["17841400000000001","17841400000000002"]);
 const noAssets=()=>api.listInstagramUnifiedAccounts({token,version:"v27.0",fetcher:async(href)=>
  new Response(JSON.stringify(href.includes("assigned_instagram_accounts")?{data:[]}:{client_business_id:"123456789012345"}),{status:200})});
 await assert.rejects(noAssets);
});

test("Unified Login is wired to opt-in start, callback, account verification and trusted Meta redirect",()=>{
 const hub=read("app/api/reach/connection-hub/route.ts");
 const start=read("app/api/platform/social/meta/start/route.ts");
 const callback=read("app/api/platform/social/meta/callback/route.ts");
 const verify=read("app/api/platform/social/meta/connections/verify/route.ts");
 const customer=read("app/connections/page.tsx");
 const admin=read("app/api/reach/developer/meta-status/route.ts");
 assert.match(hub,/instagramUnifiedReady\(metaEnvs\[1\]\)/);
 assert.match(start,/instagramUnifiedRequested\(metaEnv\)/);
 assert.match(start,/buildInstagramUnifiedAuthorizeURL/);
 assert.match(start,/configId=unified\?instagramUnifiedConfigId/);
 assert.match(start,/duplicateMetaAppId/);
 assert.match(start,/if\(!instagramUnifiedReady\(metaEnv\)&&duplicateMetaAppId/);
 assert.match(callback,/exchangeInstagramUnifiedCode/);
 assert.match(callback,/listInstagramUnifiedAccounts/);
 assert.match(callback,/unified\?shortLived/);
 assert.match(verify,/instagramUnifiedReady\(await resolvedMetaEnv/);
 assert.match(verify,/listInstagramUnifiedAccounts/);
 assert.match(customer,/u\.hostname==="www\.instagram\.com"/);
 assert.match(customer,/u\.hostname==="www\.facebook\.com"&&u\.pathname==="\/dialog\/oauth"/);
 assert.match(admin,/unifiedConfigured:unified/);
 assert.doesNotMatch(customer,/SOCIAL_META_INSTAGRAM_UNIFIED_CONFIG_ID|client_secret|access_token|api\/platform\/social\/dispatch/);
});
