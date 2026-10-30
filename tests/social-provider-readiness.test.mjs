import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {providerReadiness,SOCIAL_PROVIDER_CATALOG} from "../ghl-gpt-gateway/lib/social-provider-catalog.ts";
test("provider list is distinct and never claims live OAuth or publishing",()=>{
 const list=providerReadiness();
 assert.equal(list.length,8);
 assert.equal(new Set(list.map(x=>x.id)).size,list.length);
 for(const row of list){
  assert.equal(row.connectionStatus,"not_connected");
  assert.equal(row.oauthEnabled,false);
  assert.equal(row.publishingEnabled,false);
  assert.equal(row.analyticsEnabled,false);
 }
 assert(SOCIAL_PROVIDER_CATALOG.some(p=>p.id==="instagram"&&p.scopes.includes("instagram_business_basic")));
 assert(SOCIAL_PROVIDER_CATALOG.some(p=>p.id==="facebook"&&p.publishScopes.includes("pages_manage_posts")));
});
test("private queue callback has no social provider HTTP request",()=>{
 const handler=readFileSync(new URL("../ghl-gpt-gateway/app/api/queues/social-dry-run/route.ts",import.meta.url),"utf8");
 assert(handler.includes("consumeDryRun(payload)"));
 assert(!/\bfetch\s*\(|graph\.facebook\.com|api\.instagram\.com|oauth\.|\.publish\s*\(/.test(handler));
});
test("Neon outbox includes mutually exclusive leases and bounded retries",()=>{
 const sql=readFileSync(new URL("../ghl-gpt-gateway/lib/social-native-queue.ts",import.meta.url),"utf8");
 for(const term of ["FOR UPDATE SKIP LOCKED","claim_until","next_attempt_at","attempts<5","status='pending'","idempotent"]) assert(sql.includes(term),term);
 assert(sql.includes("markSendFailed"));
 assert(!sql.includes("graph.facebook.com"));
});
