import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const store=readFileSync(new URL("../ghl-gpt-gateway/lib/social-meta-connection-store.ts",import.meta.url),"utf8");
const social=readFileSync(new URL("../ghl-gpt-gateway/lib/social-store.ts",import.meta.url),"utf8");
// SOURCE CONTRACT + deterministic synthetic replay, not a live OAuth/SQL integration.
test("pending Meta candidates are unique, named and nonexpired",()=>{
 assert.match(store,/new Set\(candidates\.map\(c=>c\.id\)\)\.size!==candidates\.length/);
 assert.match(store,/!c\.name\.trim\(\)/);
 assert.match(store,/Date\.parse\(tokenExpiresAt\)<=Date\.now\(\)/);
 assert.match(store,/staged\.token_expires_at&&new Date\(String\(staged\.token_expires_at\)\)\.getTime\(\)<=Date\.now\(\)/);
});
test("selection and disconnect are tenant scoped, single-use and audited",()=>{
 assert.match(store,/DELETE FROM agency_social_meta_pending WHERE id=\$1::uuid AND workspace_id=\$2::uuid AND expires_at>now\(\) RETURNING id/);
 assert.match(store,/ON CONFLICT\(workspace_id,provider,provider_account_id\)/);
 for(const action of ["social.meta.connected","social.meta.verified","social.meta.disconnected"])assert.ok(store.includes("'"+action+"'"));
 assert.match(store,/DELETE FROM agency_social_meta_connections WHERE workspace_id=\$1::uuid AND id=\$2::uuid/);
 assert.match(social,/agency_social_posts WHERE workspace_id=\$1::uuid/);
 assert.ok(social.includes("'social.draft.created'"));
});
test("synthetic connect, verify, draft, plan and disconnect deny replay and cross-workspace access",()=>{
 const pending=new Map([["consent-A",{workspace:"A",account:"page-17",expires:Date.now()+60000}]]);
 const connected=new Map(),drafts=new Map(),audit=[];
 function select(workspace,consentId){
  const p=pending.get(consentId);if(!p||p.workspace!==workspace||p.expires<=Date.now())return false;
  pending.delete(consentId);connected.set(workspace+":"+p.account,{verified:false});
  audit.push({workspace,action:"social.meta.connected"});return true;
 }
 assert.equal(select("B","consent-A"),false);
 assert.equal(select("A","consent-A"),true);
 assert.equal(select("A","consent-A"),false);
 assert.equal(connected.has("B:page-17"),false);
 connected.get("A:page-17").verified=true;audit.push({workspace:"A",action:"social.meta.verified"});
 drafts.set("A:draft-1",{workspace:"A",state:"draft",channels:["facebook"]});
 audit.push({workspace:"A",action:"social.draft.created"});
 assert.equal(drafts.get("A:draft-1").state,"draft");
 drafts.get("A:draft-1").state="planned";
 assert.equal(drafts.has("B:draft-1"),false);
 assert.equal(connected.delete("B:page-17"),false);
 assert.equal(connected.delete("A:page-17"),true);
 audit.push({workspace:"A",action:"social.meta.disconnected"});
 assert.deepEqual(audit.map(x=>x.action),["social.meta.connected","social.meta.verified","social.draft.created","social.meta.disconnected"]);
 assert.equal(connected.size,0);
});
