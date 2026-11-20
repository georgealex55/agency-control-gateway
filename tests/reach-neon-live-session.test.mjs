import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const transpile=(s)=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const validator=transpile(read("lib/reach-neon-customer-config.ts"));
const validatorUrl="data:text/javascript;base64,"+Buffer.from(validator).toString("base64");
const sessionCode=transpile(read("lib/reach-neon-live-session.ts").replace(
 'import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";',
 'import {validateCustomerNeonUrl} from "'+validatorUrl+'";'
));
const live=await import("data:text/javascript;base64,"+Buffer.from(sessionCode).toString("base64"));
const dsn="postgresql://fictional:synthetic-PASSWORD@ep-frosty-silence-bdbonkjl.c-2.us-east-2.aws.neon.tech/reach_platform?sslmode=require";
const fixed={
 connectionString:dsn,database:"reach_platform",
 role:"reach_app_runtime",host:"ep-frosty-silence-bdbonkjl.c-2.us-east-2.aws.neon.tech"
};
const owner="v1.1799999999.OWNER-SYNTHETIC-CREDENTIAL.SIGNATURE";
const secret="Synthetic-secret-for-owner-session-not-for-production-2026!";
const now=1700000000000;
test("sealed owner Neon token decrypts only for its original owner session",()=>{
 const token=live.sealLiveNeonCredential(fixed,owner,secret,now);
 assert.match(token,/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 assert.equal(token.includes("synthetic-PASSWORD"),false);
 assert.equal(token.includes("reach_platform"),false);
 const decoded=live.openLiveNeonCredential(token,owner,secret,now+1000);
 assert.equal(decoded.database,"reach_platform");
 assert.equal(decoded.role,"reach_app_runtime");
 assert.equal(decoded.connectionString,dsn);
 assert.equal(decoded.expiresAt,now+4*3600000);
});
test("tampered encrypted session token cannot be opened",()=>{
 const token=live.sealLiveNeonCredential(fixed,owner,secret,now);
 for(const changed of [token.slice(0,-2)+"ab",token.replace("v1.","v2."),token+".xyz"])
  assert.equal(live.openLiveNeonCredential(changed,owner,secret,now),null);
});
test("different owner, signing secret, expired time and absent token fail closed",()=>{
 const token=live.sealLiveNeonCredential(fixed,owner,secret,now);
 assert.equal(live.openLiveNeonCredential(token,"different-owner",secret,now),null);
 assert.equal(live.openLiveNeonCredential(token,owner,secret+"rotated",now),null);
 assert.equal(live.openLiveNeonCredential(token,owner,secret,now+live.LIVE_NEON_MAX_AGE*1000),null);
 assert.equal(live.openLiveNeonCredential(undefined,owner,secret,now),null);
 assert.equal(live.openLiveNeonCredential(token,undefined,secret,now),null);
});
test("cannot seal mismatched, missing, or owner-invalid Neon credentials",()=>{
 assert.throws(()=>live.sealLiveNeonCredential({...fixed,database:"other"},owner,secret,now));
 assert.throws(()=>live.sealLiveNeonCredential(fixed,"",secret,now));
 assert.throws(()=>live.sealLiveNeonCredential(fixed,owner,"short",now));
});
test("no privileged database DML, DDL, token echo, or durable storage in live route",()=>{
 const r=read("app/api/reach/connections/neon/live/route.ts");
 assert.match(r,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(r,/if\(!sameOrigin\(req\)\)/);
 assert.match(r,/httpOnly:true/);
 assert.match(r,/sameSite:"strict"/);
 assert.match(r,/SELECT current_database\(\)/);
 assert.match(r,/storageActivated:false/);
 assert.match(r,/persisted:false/);
 assert.doesNotMatch(r,/\bINSERT INTO\b|\bALTER TABLE\b|\bCREATE TABLE\b|\bDROP TABLE\b|console\.log|localStorage|sessionStorage/);
});
test("customer UI connects and disconnects without a durable saved credential",()=>{
 const ui=read("app/connections/neon-customer-card.tsx");
 assert.match(ui,/Connect Neon \(4-hour session\)/);
 assert.match(ui,/Disconnect Neon/);
 assert.match(ui,/setDsn\(""\)/);
 assert.match(ui,/setPassword\(""\)/);
 assert.match(ui,/body:JSON\.stringify\(\{connectionString\}\)/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie/);
});
