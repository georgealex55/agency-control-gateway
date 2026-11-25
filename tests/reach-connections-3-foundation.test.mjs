import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const code=ts.transpileModule(read("lib/reach-connection-health.ts"),{
 compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {assessConnectionHealth,healthLabel,healthSummary}=
 await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const now=Date.parse("2026-11-23T18:00:00.000Z"),day=24*60*60*1000;
const iso=ms=>new Date(ms).toISOString();
test("Connections 3.0 health cannot assert live health from stale, missing or expired evidence",()=>{
 assert.equal(assessConnectionHealth({expiresAt:iso(now-day),lastVerifiedAt:iso(now-60_000)},now),"expired");
 assert.equal(assessConnectionHealth({expiresAt:iso(now+day),lastVerifiedAt:iso(now-60_000)},now),"expires_soon");
 assert.equal(assessConnectionHealth({expiresAt:iso(now+15*day),lastVerifiedAt:null},now),"verification_due");
 assert.equal(assessConnectionHealth({expiresAt:iso(now+15*day),lastVerifiedAt:iso(now-8*day)},now),"verification_due");
 assert.equal(assessConnectionHealth({expiresAt:iso(now+15*day),lastVerifiedAt:iso(now+60_000)},now),"verified_recently");
 assert.equal(assessConnectionHealth({expiresAt:null,lastVerifiedAt:iso(now-60_000)},now),"verified_recently");
 assert.equal(assessConnectionHealth({expiresAt:null,lastVerifiedAt:iso(now-8*day)},now),"expiry_unknown");
 assert.equal(assessConnectionHealth({expiresAt:null,lastVerifiedAt:null},now),"expiry_unknown");
 assert.equal(assessConnectionHealth({expiresAt:"bad",lastVerifiedAt:iso(now-60_000)},now),"expiry_unknown");
 assert.equal(assessConnectionHealth({expiresAt:iso(now+15*day),lastVerifiedAt:iso(now+2*day)},now),"verification_due");
 assert.equal(healthLabel("verified_recently"),"Verified recently");
 assert.deepEqual(healthSummary([{status:"verified_recently"},{status:"expired"},{status:"expiry_unknown"}]),
  {total:3,verifiedRecently:1,needsAttention:2});
});
test("health endpoint is owner-gated, selected workspace scoped, read-only and credential free",()=>{
 const route=read("app/api/reach/connections/health/route.ts");
 assert.match(route,/connectionGate\(req\)/);
 assert.match(route,/workspaceFromQuery\(req\)/);
 assert.match(route,/socialMetaWorkspaceDb\(workspaceId\)/);
 assert.match(route,/WHERE workspace_id=\$1::uuid/);
 assert.match(route,/assessConnectionHealth\(/);
 assert.match(route,/healthSummary\(connections\)/);
 assert.match(route,/liveProviderPing:false/);
 assert.match(route,/publishingEnabled:false/);
 assert.doesNotMatch(route,/\bDELETE FROM\b|\bINSERT INTO\b|\bUPDATE\b|\bDROP TABLE\b/i);
 assert.doesNotMatch(route,/encrypted_access_token|sealed_client_secret|client_secret|bearer|access_token|publishPost|sendMessage/i);
 const gate=read("lib/social-api.ts");
 assert.match(gate,/if\(!adminAuthenticated\(req\)\)/);
 assert.match(gate,/if\(!connectionRuntimeEnabled\(\)\)/);
 const db=read("lib/reach-social-owner-db.ts");
 assert.match(db,/workspaceId!==process\.env\.REACH_SOCIAL_OWNER_WORKSPACE_ID/);
 assert.match(db,/set_config\('reach\.workspace_id'/);
});
test("customer page shows only operational or previously linked providers, no future catalog",()=>{
 const page=read("app/connections/page.tsx");
 assert.match(page,/hub\?\.providers\.filter\(p=>/);
 assert.match(page,/m\.launchEnabled\|\|inventory\?\.connections\.some/);
 assert.match(page,/inventory\?\.pending\.some/);
 assert.match(page,/No available integrations yet/);
 assert.match(page,/Show only connections needing attention/);
 assert.match(page,/healthLabel\(h\.status\)/);
 assert.match(page,/Access expires:/);
 assert.match(page,/Provider was not contacted/);
 assert.match(page,/Status unavailable/);
 assert.match(page,/\/api\/reach\/connections\/health\?workspaceId=/);
 assert.doesNotMatch(page,/NeonCustomerCard|SocialReadiness|clientSecret:|api\/platform\/social\/dispatch|publishPost|sendMessage/);
 const developer=read("app/developer/meta/developer-meta-console.tsx");
 assert.match(developer,/<NeonCustomerCard\/>/);
 const gate=read("app/developer/meta/page.tsx");
 assert.match(gate,/validSession\(/);
});
test("phase plan matches approved questionnaire without enabling provider side effects",()=>{
 const doc=readFileSync(new URL("../docs/reach-connections-3-foundation-plan.md",import.meta.url),"utf8");
 assert.match(doc,/1D, 2D, 3B, 4D, 5D, 6D, 7D, 8D, 9D, 10D, 11A, 12D/);
 for(const term of ["Google Business Profile","Gmail","Calendar","Microsoft 365","Twilio","WordPress","Shopify","Resend","Stripe","bounded retry","owner notifications","workspace membership","approval"])assert.ok(doc.includes(term),term);
 assert.match(doc,/No Instagram Unified Login configuration or reactivation/);
});
