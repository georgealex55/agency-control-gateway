import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const source=read("lib/reach-neon-customer-config.ts");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {validateCustomerNeonUrl}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const url=(host="ep-frosty-silence-bdbonkjl.c-2.us-east-2.aws.neon.tech",pass="synthetic-PASSWORD")=>
 "postgresql://reach_app_runtime:"+encodeURIComponent(pass)+"@"+host+"/reach_platform?sslmode=require";
test("valid Neon DSN and TLS-only host returns server-local normalized fields",()=>{
 const v=validateCustomerNeonUrl(url());assert.equal(v.databaseName,"reach_platform");
 assert.equal(v.hostname,"ep-frosty-silence-bdbonkjl.c-2.us-east-2.aws.neon.tech");
 assert.match(v.connectionString,/^postgresql:/);
});
test("official pooled Neon endpoint and channel binding required",()=>{
 const v=validateCustomerNeonUrl(url("ep-frosty-silence-bdbonkjl-pooler.c-2.us-east-2.aws.neon.tech").replace("sslmode=require","sslmode=verify-full&channel_binding=require"));
 assert.equal(v.databaseName,"reach_platform");
});
test("percent-escaped strong password punctuation",()=>{
 const v=validateCustomerNeonUrl(url(undefined,"test# :@%? /é"));
 assert.ok(v.connectionString.includes("test%23"));
});
test("rejects private, arbitrary, and lookalike hostnames to prevent SSRF",()=>{
 for(const host of ["localhost","127.0.0.1","10.0.0.2","ep-x.aws.neon.tech.evil.com","evil.test","neon.tech","ep-x.neon.tech","ep-x..aws.neon.tech","ep-x.internal.neon.tech"]){
  assert.throws(()=>validateCustomerNeonUrl(url(host)),undefined,host);
 }
});
test("rejects disabled or absent TLS, unsupported query settings and nonstandard port",()=>{
 for(const s of [url().replace("sslmode=require","sslmode=disable"),url().replace("?sslmode=require",""),
  url().replace("sslmode=require","sslmode=require&options=-c%20statement_timeout%3D0"),
  url().replace("sslmode=require","sslmode=require&sslmode=disable"),
  url().replace("sslmode=require","sslmode=require&channel_binding=disable"),
  url().replace("sslmode=require","sslmode=require&channel_binding=require&channel_binding=require"),
  url().replace("neon.tech/","neon.tech:5433/")])assert.throws(()=>validateCustomerNeonUrl(s));
});
test("rejects unsupported URL, fragments, and malformed database paths",()=>{
 for(const s of [url().replace("postgresql:","https:"),url()+"#secret",
  url().replace("/reach_platform?","/bad/other?"),"invalid",null,""])
  assert.throws(()=>validateCustomerNeonUrl(s));
});
test("verification route supports production but requires owner, same-origin and read-only SQL",()=>{
 const route=read("app/api/reach/connections/neon/verify/route.ts");
 assert.doesNotMatch(route,/process\.env\.VERCEL_ENV==="production"/);
 assert.match(route,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(route,/if\(!sameOrigin\(req\)\)/);
 assert.match(route,/SELECT current_database\(\)/);
 assert.match(route,/connectionSaved:false/);
 assert.match(route,/storageActivated:false/);
 assert.doesNotMatch(route,/\bINSERT\s+INTO\b|\bUPDATE\s+agency_|\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|console\.log|localStorage|sessionStorage/i);
});
test("customer entry never transmits project/branch IDs or stores secrets in browser",()=>{
 const card=read("app/connections/neon-customer-card.tsx");
 assert.match(card,/Test connection \(read-only\)/);assert.match(card,/Save Neon \(encrypted\)/);
 assert.match(card,/body:JSON\.stringify\(\{connectionString\}\)/);
 assert.match(card,/setPassword\(""\)/);assert.match(card,/setDsn\(""\)/);
 assert.doesNotMatch(card,/localStorage|sessionStorage|document\.cookie/);
});
test("Neon card is mounted only after signed-in connection hub loads",()=>{
 const page=read("app/connections/page.tsx");
 assert.match(page,/import NeonCustomerCard from "\.\/neon-customer-card"/);
 assert.match(page,/\{hub&&<>\s*<NeonCustomerCard\/>/);
});
test("new TS and TSX files compile without syntax diagnostics",()=>{
 for(const path of ["lib/reach-neon-customer-config.ts","app/api/reach/connections/neon/verify/route.ts","app/connections/neon-customer-card.tsx"]){
  const t=ts.transpileModule(read(path),{fileName:path,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022}});
  assert.equal((t.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,path);
 }
});
