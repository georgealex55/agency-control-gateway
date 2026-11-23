import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const code=read("ghl-gpt-gateway/lib/reach-connection-approval.ts");
const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const runtime=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const login=read("ghl-gpt-gateway/app/login/page.tsx");
const loginApi=read("ghl-gpt-gateway/app/api/portal/session/route.ts");
const portal=read("ghl-gpt-gateway/lib/portal-auth.ts");
const connectionUI=read("ghl-gpt-gateway/app/connections/page.tsx");
const hub=read("ghl-gpt-gateway/app/api/reach/connection-hub/route.ts");
const runtimeSource=read("ghl-gpt-gateway/lib/reach-connection-runtime.ts");
const socialGate=read("ghl-gpt-gateway/lib/social-api.ts");
const socialMetaStart=read("ghl-gpt-gateway/app/api/platform/social/meta/start/route.ts");
const socialMetaCallback=read("ghl-gpt-gateway/app/api/platform/social/meta/callback/route.ts");
const metaReadiness=read("ghl-gpt-gateway/app/api/platform/social/meta/readiness/route.ts");
const metaConnections=read("ghl-gpt-gateway/app/api/platform/social/meta/connections/route.ts");
const metaVerify=read("ghl-gpt-gateway/app/api/platform/social/meta/connections/verify/route.ts");
const contracts=read("ghl-gpt-gateway/lib/social-meta-contract.ts");
const home=read("ghl-gpt-gateway/app/page.tsx");
const workspaces=read("ghl-gpt-gateway/app/api/platform/workspaces/route.ts");
test("production DB approval requires exact approved credential and explicit opt-in",()=>{
 const uri="postgresql://fictional:syn-ONLY@localhost:5432/mock_reach_prod";
 const hash=createHash("sha256").update(uri).digest("hex");
 const env={VERCEL_ENV:"production",REACH_CONNECTIONS_PRODUCTION_ENABLED:"true",
  AGENCY_PLATFORM_DATABASE_URL:uri,REACH_CONNECTIONS_APPROVED_DATABASE_SHA256:hash};
 assert.equal(runtime.productionDatabaseApproved(env),true);
 for(const [name,value] of [["VERCEL_ENV","preview"],["REACH_CONNECTIONS_PRODUCTION_ENABLED","false"],
  ["AGENCY_PLATFORM_DATABASE_URL","postgres://different"],["REACH_CONNECTIONS_APPROVED_DATABASE_SHA256","f".repeat(64)],
  ["REACH_CONNECTIONS_APPROVED_DATABASE_SHA256","invalid"]]){
  assert.equal(runtime.productionDatabaseApproved({...env,[name]:value}),false,name+" must fail closed");
 }
 assert.equal(runtime.productionDatabaseApproved({}),false);
});
test("owner login uses existing server session, strict same-origin cookie and safe navigation",()=>{
 assert.match(login,/fetch\("\/api\/portal\/session"/);
 assert.match(login,/credentials:"same-origin"/);
 assert.match(login,/type="password"/);
 assert.match(login,/autoComplete="current-password"/);
 assert.match(login,/value==="\/connections"\|\|value==="\/developer\/meta"\|\|value==="\/"/);
 assert.match(login,/window\.location\.assign\(next\)/);
 assert.doesNotMatch(login,/localStorage|sessionStorage/);
 assert.match(loginApi,/if \(!sameOrigin\(req\)\)/);
 assert.match(loginApi,/httpOnly:true/);
 assert.match(loginApi,/sameSite:"strict"/);
 assert.match(portal,/timingSafeEqual/);
 assert.match(portal,/createHmac\("sha256"/);
});
test("connection hub gives no metadata unless owner is signed in",()=>{
 assert.match(hub,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(hub,/if\(!enabled\)return reply/);
 assert.match(hub,/workspaces:\[\]/);
 assert.match(hub,/publishingEnabled:false,externalMessagingEnabled:false/);
 assert.doesNotMatch(hub,/client_secret:|access_token:|tokenValue/);
});
test("only Meta account administration can be enabled on production, not studio dispatch",()=>{
 assert.match(socialGate,/export function connectionGate\(/);
 assert.match(socialGate,/write&&!sameOrigin\(req\)/);
 assert.match(socialGate,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(socialGate,/if\(!connectionRuntimeEnabled\(\)\)/);
 assert.match(socialGate,/if\(!stageEnabled\(process\.env\)\)/);
 for(const source of [socialMetaStart,metaReadiness,metaConnections,metaVerify])assert.match(source,/connectionGate\(req/);
 assert.match(socialMetaCallback,/if\(!connectionRuntimeEnabled\(\)/);
 assert.match(socialMetaStart,/SOCIAL_META_CONNECTIONS_ENABLED/);
 assert.match(socialMetaStart,/metaConfigured\(metaEnv,input\.provider\)/);
 assert.match(socialMetaStart,/resolvedMetaEnv\(input\.provider\)/);
 assert.match(socialMetaStart,/!setup\.isCanonicalHost\|\|!setup\.branchMatches/);
 assert.match(contracts,/requestOrigin===callbackOrigin/);
 assert.match(socialMetaCallback,/verifyMetaConsent/);
 assert.match(socialMetaCallback,/consumeMetaFlow/);
 assert.match(socialMetaCallback,/const production=process\.env\.VERCEL_ENV==="production"/);
});
test("connection actions are explicit, selected workspace scoped and read-only",()=>{
 assert.match(connectionUI,/hub\.storageApproved&&workspace/);
 assert.match(connectionUI,/window\.location\.assign\(target\)/);
 assert.match(connectionUI,/trustedMetaAuth\(result\.authorizeUrl,provider\)/);
 assert.match(connectionUI,/u\.hostname==="www\.facebook\.com"/);
 assert.match(connectionUI,/u\.hostname==="www\.instagram\.com"/);
 assert.match(connectionUI,/method:"POST"/);
 assert.match(connectionUI,/method:"DELETE"/);
 assert.match(connectionUI,/window\.confirm\("Disconnect this account/);
 assert.match(connectionUI,/workspaceId:workspace/);
 assert.match(connectionUI,/Account selected\. Read-only verification is available/);
 assert.match(connectionUI,/Integration not yet available/);
 assert.match(connectionUI,/guideMetaSetup\(/);
 assert.match(connectionUI,/No developer app credentials are required/);
 assert.doesNotMatch(connectionUI,/localStorage|sessionStorage|access_token|client_secret/);
});
test("UI never infers connection from provider config or enables posting",()=>{
 assert.match(connectionUI,/health&&stats\.length\?stats\.every\(h=>h\.status==="verified_recently"\)/);
 assert.match(connectionUI,/Not connected/);
 assert.match(connectionUI,/Only a successfully completed provider OAuth and verified stored account record/);
 assert.match(connectionUI,/publishing and messaging stay disabled/);
 assert.match(home,/href="\/connections"/);
 assert.match(home,/href="\/login"/);
 assert.match(workspaces,/VERCEL_ENV==="production"&&!productionConnectionApproved\(\)/);
 assert.doesNotMatch(connectionUI,/\/api\/platform\/social\/dispatch|publishPost|sendMessage/);
});
