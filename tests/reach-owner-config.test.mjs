import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const source=readFileSync(new URL("../ghl-gpt-gateway/lib/reach-portal-setup.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {assessPortalCredentials}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const goodHash="a".repeat(64),goodSecret="some-strong-private-synthetic-test-secret-of-64-characters-only";
test("correct private owner configuration is ready without leaking values",()=>{
 assert.deepEqual(assessPortalCredentials(goodHash,goodSecret),{configured:true,setupIssue:null});
});
test("new SHA-256 pasted with prefix, wrong size or invalid characters reports hash misconfiguration",()=>{
 for(const hash of ["SHA256: "+goodHash,goodHash.slice(0,63),goodHash+"x","not a hash","z".repeat(64)]){
  assert.deepEqual(assessPortalCredentials(hash,goodSecret),{configured:false,setupIssue:"password_hash_invalid"});
 }
});
test("short or missing session secret reports its own error",()=>{
 for(const secret of ["", "short", "x".repeat(31)]){
  assert.deepEqual(assessPortalCredentials(goodHash,secret),{configured:false,setupIssue:"session_secret_invalid"});
 }
});
test("multiple invalid values produce a combined error",()=>{
 assert.deepEqual(assessPortalCredentials("broken","short"),{configured:false,setupIssue:"both_invalid"});
});
test("surrounding hash whitespace and uppercase hex are canonicalized server-side",()=>{
 assert.deepEqual(assessPortalCredentials(" "+goodHash.toUpperCase()+"\n",goodSecret),{configured:true,setupIssue:null});
});
test("diagnostic code never exposes password, secret, length, or digest",()=>{
 const auth=readFileSync(new URL("../ghl-gpt-gateway/lib/portal-auth.ts",import.meta.url),"utf8");
 const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/portal/session/route.ts",import.meta.url),"utf8");
 const login=readFileSync(new URL("../ghl-gpt-gateway/app/login/page.tsx",import.meta.url),"utf8");
 assert.match(route,/setupIssue: portalSetupIssue\(\)/);
 assert.match(auth,/assessPortalCredentials\(passwordHash,secret\)/);
 assert.match(login,/session\?\.setupIssue==="password_hash_invalid"/);
 assert.match(login,/session\?\.setupIssue==="session_secret_invalid"/);
 assert.doesNotMatch(route,/process\.env|passwordHash|sessionSecret/);
 assert.doesNotMatch(source,/console\.|log\(/);
});
