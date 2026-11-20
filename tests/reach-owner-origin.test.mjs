import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const originCode=readFileSync(new URL("../ghl-gpt-gateway/lib/reach-owner-origin.ts",import.meta.url),"utf8");
const transpiled=ts.transpileModule(originCode,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ownerSameOrigin}=await import("data:text/javascript;base64,"+Buffer.from(transpiled).toString("base64"));
const login=readFileSync(new URL("../ghl-gpt-gateway/app/login/page.tsx",import.meta.url),"utf8");
const auth=readFileSync(new URL("../ghl-gpt-gateway/lib/portal-auth.ts",import.meta.url),"utf8");
const base={
 originHeader:"https://agency-control-gateway.vercel.app",
 requestUrlOrigin:"https://agency-control-gateway-unique-abc.vercel.app",
 hostHeader:"agency-control-gateway.vercel.app",
 forwardedHostHeader:"agency-control-gateway.vercel.app",
 forwardedProtoHeader:"https",
 vercelEnvironment:"production",
 vercelDeploymentUrl:"agency-control-gateway-unique-abc.vercel.app"
};
test("production canonical Vercel host maps to browser origin when internal nextUrl differs",()=>{
 assert.equal(ownerSameOrigin(base),true);
});
test("production project alias is accepted when routed by the platform",()=>{
 assert.equal(ownerSameOrigin({...base,originHeader:"https://agency-control-gateway-georgealex1925-2750s-projects.vercel.app",
 hostHeader:"agency-control-gateway-georgealex1925-2750s-projects.vercel.app",
 forwardedHostHeader:"agency-control-gateway-georgealex1925-2750s-projects.vercel.app"}),true);
});
test("current exact Vercel deployment hostname is supported",()=>{
 assert.equal(ownerSameOrigin({...base,originHeader:"https://agency-control-gateway-unique-abc.vercel.app",
 hostHeader:"agency-control-gateway-unique-abc.vercel.app",
 forwardedHostHeader:"agency-control-gateway-unique-abc.vercel.app"}),true);
});
test("local Next.js direct origin remains supported for synthetic login integration",()=>{
 assert.equal(ownerSameOrigin({...base,originHeader:"http://localhost:3904",requestUrlOrigin:"http://localhost:3904",vercelEnvironment:undefined}),true);
});
test("unknown domain cannot become an authorized production origin through spoofed Host",()=>{
 assert.equal(ownerSameOrigin({...base,originHeader:"https://malicious-site.example",hostHeader:"malicious-site.example",forwardedHostHeader:"malicious-site.example"}),false);
});
test("an origin mismatch is rejected",()=>{
 assert.equal(ownerSameOrigin({...base,originHeader:"https://malicious-site.example"}),false);
});
test("mismatched Host and forwarded Host are rejected",()=>{
 assert.equal(ownerSameOrigin({...base,hostHeader:"malicious-site.example"}),false);
});
test("the fallback is denied for non-production and HTTP",()=>{
 assert.equal(ownerSameOrigin({...base,vercelEnvironment:"preview"}),false);
 assert.equal(ownerSameOrigin({...base,forwardedProtoHeader:"http"}),false);
 assert.equal(ownerSameOrigin({...base,originHeader:"http://agency-control-gateway.vercel.app"}),false);
});
test("missing and structurally invalid origin values are rejected",()=>{
 for(const originHeader of [null,"","not a url","https://user:pass@agency-control-gateway.vercel.app",
  "https://agency-control-gateway.vercel.app/path","https://agency-control-gateway.vercel.app?a=1"]){
  assert.equal(ownerSameOrigin({...base,originHeader}),false,String(originHeader));
 }
});
test("explicitly trusted custom domain must be exactly configured",()=>{
 const changed={...base,originHeader:"https://reach.example.com",hostHeader:"reach.example.com",
 forwardedHostHeader:"reach.example.com"};
 assert.equal(ownerSameOrigin(changed),false);
 assert.equal(ownerSameOrigin({...changed,configuredCanonicalOrigin:"https://reach.example.com"}),true);
 assert.equal(ownerSameOrigin({...changed,configuredCanonicalOrigin:"https://other.example.com"}),false);
});
test("portal's active sameOrigin path uses the restricted Vercel-aware helper",()=>{
 assert.match(auth,/import \{ownerSameOrigin\} from "@\/lib\/reach-owner-origin"/);
 assert.match(auth,/return ownerSameOrigin\(/);
 assert.match(auth,/hostHeader:req\.headers\.get\("host"\)/);
 assert.match(auth,/forwardedHostHeader:req\.headers\.get\("x-forwarded-host"\)/);
});
test("owner login displays actionable HTTP errors and confirms cookie before redirect",()=>{
 assert.match(login,/response\.status===401/);
 assert.match(login,/response\.status===403/);
 assert.match(login,/response\.status===503/);
 assert.match(login,/verifiedSession\?\.authenticated!==true/);
 assert.match(login,/window\.location\.assign\(next\)/);
 assert.doesNotMatch(login,/localStorage|sessionStorage|process\.env\.AGENCY_PORTAL_SESSION_SECRET/);
});
