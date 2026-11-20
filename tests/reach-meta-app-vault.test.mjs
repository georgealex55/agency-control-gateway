import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomBytes} from "node:crypto";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const migration=read("db/reach-vault/V003__owner_meta_app_credentials.sql");
test("Meta app secrets are stored behind isolated owner-vault RLS",()=>{
 assert.match(migration,/CREATE TABLE reach_vault\.owner_meta_apps/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
 assert.match(migration,/TO reach_vault_app/);
 assert.match(migration,/CHECK \(provider IN \('facebook_pages','instagram_professional'\)\)/);
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|GRANT\s+.+BYPASSRLS/i);
});
test("Meta app setup route never returns secret and requires owner same-origin",()=>{
 const src=read("app/api/reach/connections/meta-apps/route.ts");
 assert.match(src,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(src,/if\(!sameOrigin\(req\)\)/);
 assert.match(src,/metaAppVaultReady/);
 assert.match(src,/saveOwnerMetaApp/);
 assert.match(src,/credentialsEncrypted:true/);
 assert.match(src,/accountConnected:false/);
 assert.match(src,/no-store/);
 assert.doesNotMatch(src,/console\.log|localStorage|sessionStorage|clientSecret:p\.clientSecret/);
});
test("Meta app vault decrypts only with correct provider key and AAD",async()=>{
 let source=read("lib/reach-meta-app-vault.ts");
 const substitutions=[
 ['import {neon} from "@neondatabase/serverless";','const neon=()=>{throw Error("Database access forbidden in crypto test");};'],
 ['import {neonVaultConfigured} from "@/lib/reach-neon-vault-store";','const neonVaultConfigured=()=>false;'],
 ['import {isMetaProvider,type MetaProvider} from "@/lib/social-meta-contract";',
  'const isMetaProvider=(v:unknown)=>v==="facebook_pages"||v==="instagram_professional";']
 ];
 for(const [a,b] of substitutions){assert.ok(source.includes(a));source=source.replace(a,b);}
 source+="\nexport const cryptoTest={encrypt,decrypt};";
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {cryptoTest}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
 const before=process.env.REACH_VAULT_ENCRYPTION_KEY;
 try{
  process.env.REACH_VAULT_ENCRYPTION_KEY=randomBytes(32).toString("base64url");
  const phrase="Synthetic-meta-app-secret-1234567890";
  const a=cryptoTest.encrypt(phrase,"facebook_pages");
  assert.equal(a.startsWith("v1."),true);
  assert.equal(a.includes(phrase),false);
  assert.equal(cryptoTest.decrypt(a,"facebook_pages"),phrase);
  assert.throws(()=>cryptoTest.decrypt(a,"instagram_professional"));
  const modified=a.slice(0,-3)+"abc";
  assert.throws(()=>cryptoTest.decrypt(modified,"facebook_pages"));
  const firstKey=process.env.REACH_VAULT_ENCRYPTION_KEY;
  process.env.REACH_VAULT_ENCRYPTION_KEY=randomBytes(32).toString("base64url");
  assert.notEqual(process.env.REACH_VAULT_ENCRYPTION_KEY,firstKey);
  assert.throws(()=>cryptoTest.decrypt(a,"facebook_pages"));
 }finally{
  if(before===undefined)delete process.env.REACH_VAULT_ENCRYPTION_KEY;
  else process.env.REACH_VAULT_ENCRYPTION_KEY=before;
 }
});
test("Meta credentials resolve provider-specifically without mutating global env",()=>{
 const source=read("lib/reach-meta-app-vault.ts");
 assert.match(source,/resolvedMetaEnv/);
 assert.match(source,/SOCIAL_META_FACEBOOK/);
 assert.match(source,/SOCIAL_META_INSTAGRAM/);
 assert.match(source,/return\{\.\.\.env,/);
 assert.doesNotMatch(source,/process\.env\s*=/);
});
test("Owner hub and consent start/callback/readiness use vault settings",()=>{
 for(const path of [
  "app/api/reach/connection-hub/route.ts",
  "app/api/platform/social/meta/start/route.ts",
  "app/api/platform/social/meta/callback/route.ts",
  "app/api/platform/social/meta/readiness/route.ts"
 ]){
  const source=read(path);
  assert.match(source,/resolvedMetaEnv\(/,path);
 }
 const callback=read("app/api/platform/social/meta/callback/route.ts");
 assert.match(callback,/verifyMetaConsent/);
 assert.match(callback,/sameNonce/);
 assert.match(callback,/consumeMetaFlow/);
 assert.match(callback,/stageMetaCandidates/);
});
test("Owner UI encrypts app credentials and never stores secrets in browser",()=>{
 const ui=read("app/connections/social-readiness.tsx");
 assert.match(ui,/Save app credentials \(encrypted\)/);
 assert.match(ui,/type="password"/);
 assert.match(ui,/setAppSecret\(old=>\(\{\.\.\.old,\[provider\]:""\}\)\)/);
 assert.match(ui,/clientSecret:secret/);
 assert.match(ui,/Saving an app does not connect an account/);
 assert.match(ui,/Publishing & messaging/);
 assert.match(ui,/Disabled/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie|console\.log/);
});
test("All new TS/TSX files compile syntactically",()=>{
 for(const path of ["lib/reach-meta-app-vault.ts","app/api/reach/connections/meta-apps/route.ts",
  "app/api/reach/connection-hub/route.ts","app/api/platform/social/meta/start/route.ts",
  "app/api/platform/social/meta/callback/route.ts","app/connections/social-readiness.tsx"]){
  const diagnostics=ts.transpileModule(read(path),{
   fileName:path,reportDiagnostics:true,
   compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022}
  }).diagnostics||[];
  assert.equal(diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,path);
 }
});
