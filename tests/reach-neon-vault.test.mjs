import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomBytes} from "node:crypto";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const transpile=(s)=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const validatorUrl="data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-neon-customer-config.ts"))).toString("base64");
const vaultCode=transpile(read("lib/reach-neon-vault-crypto.ts").replace(
 'import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";',
 'import {validateCustomerNeonUrl} from "'+validatorUrl+'";'
));
const crypto=await import("data:text/javascript;base64,"+Buffer.from(vaultCode).toString("base64"));
const env={REACH_VAULT_ENCRYPTION_KEY:randomBytes(32).toString("base64url")};
const dsn="postgresql://owner:fictional-SECRET@ep-frosty-silence-bdbonkjl.c-2.us-east-2.aws.neon.tech/reach_platform?sslmode=require";
test("vault AES-256-GCM encrypts DSN and can unseal it with the correct independent key",()=>{
 assert.equal(crypto.vaultEncryptionReady(env),true);
 const sealed=crypto.sealNeonVaultCredential(dsn,env);
 assert.match(sealed,/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 assert.equal(sealed.includes("fictional-SECRET"),false);
 assert.equal(crypto.unsealNeonVaultCredential(sealed,env),dsn);
});
test("different vault keys cannot decrypt ciphertext",()=>{
 const sealed=crypto.sealNeonVaultCredential(dsn,env);
 assert.throws(()=>crypto.unsealNeonVaultCredential(sealed,{REACH_VAULT_ENCRYPTION_KEY:randomBytes(32).toString("base64url")}));
});
test("tampering, invalid env and invalid DSNs fail closed",()=>{
 const sealed=crypto.sealNeonVaultCredential(dsn,env);
 assert.throws(()=>crypto.unsealNeonVaultCredential(sealed.slice(0,-2)+"zz",env));
 assert.throws(()=>crypto.unsealNeonVaultCredential("broken",env));
 assert.throws(()=>crypto.sealNeonVaultCredential(dsn,{REACH_VAULT_ENCRYPTION_KEY:"short"}));
 assert.throws(()=>crypto.sealNeonVaultCredential("postgresql://owner:pass@localhost/x?sslmode=require",env));
});
test("vault SQL is separate, additive, RLS-protected and without destructive operations",()=>{
 const m1=read("db/reach-vault/V001__owner_neon_vault.sql");
 const m2=read("db/reach-vault/V002__owner_vault_runtime_policy.sql");
 assert.match(m1,/CREATE SCHEMA IF NOT EXISTS reach_vault/);
 assert.match(m1,/CREATE TABLE IF NOT EXISTS reach_vault\.owner_neon_connections/);
 assert.match(m1,/ENABLE ROW LEVEL SECURITY/);
 assert.match(m1,/FORCE ROW LEVEL SECURITY/);
 assert.match(m2,/TO reach_vault_app/);
 for(const src of [m1,m2])assert.doesNotMatch(src,/\bTRUNCATE\b|\bDROP TABLE\b|\bDELETE FROM\b/i);
});
test("owner-only encrypted vault API never echoes secrets, only accepts signed owner",()=>{
 const route=read("app/api/reach/connections/neon/saved/route.ts");
 assert.match(route,/adminAuthenticated\(req\)/);
 assert.match(route,/sameOrigin\(req\)/);
 assert.match(route,/savedNeon\(\)/);
 assert.match(route,/useLiveSession/);
 assert.match(route,/saveNeon\(/);
 assert.match(route,/deleteSavedNeon\(/);
 assert.match(route,/storageActivated:false/);
 assert.doesNotMatch(route,/console\.log|localStorage|sessionStorage|process\.env\.AGENCY_PLATFORM_DATABASE_URL/);
});
test("vault runtime role is isolated from generic platform database config",()=>{
 const store=read("lib/reach-neon-vault-store.ts");
 assert.match(store,/REACH_VAULT_DATABASE_URL/);
 assert.match(store,/u\.username!=="reach_vault_app"/);
 assert.match(store,/reach_vault\.owner_neon_connections/);
 assert.doesNotMatch(store,/process\.env\.AGENCY_PLATFORM_DATABASE_URL/);
});
test("owner UI handles saved status and allows encrypted Save/Remove",()=>{
 const ui=read("app/connections/neon-customer-card.tsx");
 assert.match(ui,/Save Neon \(encrypted\)/);
 assert.match(ui,/Save this live connection/);
 assert.match(ui,/Remove saved connection/);
 assert.match(ui,/\/api\/reach\/connections\/neon\/saved/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie/);
});
test("all newly authored source files parse with TypeScript compiler",()=>{
 for(const path of ["lib/reach-neon-vault-crypto.ts","lib/reach-neon-vault-store.ts","app/api/reach/connections/neon/saved/route.ts","app/connections/neon-customer-card.tsx"]){
  const diagnostics=ts.transpileModule(read(path),{fileName:path,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022}}).diagnostics||[];
  assert.equal(diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,path);
 }
});
