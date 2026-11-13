'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyntheticEstimates,UP,DOWN}=require('./estimates.cjs');
const session=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
function harness(stage='contacted'){
 const calls=[];let revision=0;
 const db={transaction:async fn=>fn({query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT id,stage'))return {rows:[{id:'opp-1',stage}]};
  if(sql.startsWith('SELECT COALESCE'))return {rows:[{revision:revision++}]};
  return {rows:[]};
 }})};
 return {api:createSyntheticEstimates({db,session}),calls};
}
const payload={opportunityId:'opp-1',amountCents:129900,currency:'USD',note:'Synthetic proposal',followUpAt:'2026-11-20T15:00:00Z'};
test('creates estimate revision and internal follow-up atomically with tenant-filtered SQL',async()=>{
 const h=harness();const r=await h.api.revise('business-a',payload);
 assert.equal(r.revision,1);assert.equal(r.dispatched,false);
 assert.equal(h.calls.length,5);
 assert.ok(h.calls.every(x=>x.params[0]==='business-a'));
 assert.match(h.calls[2].sql,/INSERT INTO reach23_estimates/);
 assert.match(h.calls[3].sql,/INSERT INTO reach23_estimate_followups/);
});
test('revisions increment and old open follow-up is cancelled',async()=>{
 const h=harness();await h.api.revise('business-a',payload);
 const next=await h.api.revise('business-a',{...payload,amountCents:149900});
 assert.equal(next.revision,2);
 assert.match(h.calls.at(-1).sql,/status='cancelled'/);
});
test('cross-tenant access denied before any query',async()=>{
 const h=harness();
 await assert.rejects(h.api.revise('business-b',payload),/Forbidden/);
 await assert.rejects(h.api.due('business-b','2026-11-20T15:00:00Z'),/Forbidden/);
 assert.equal(h.calls.length,0);
});
test('rejects invalid amounts, timestamps and closed opportunities',async()=>{
 const h=harness();
 await assert.rejects(h.api.revise('business-a',{...payload,amountCents:-1}),/Invalid synthetic estimate/);
 await assert.rejects(h.api.revise('business-a',{...payload,followUpAt:'not-a-date'}),/Invalid synthetic estimate/);
 await assert.rejects(harness('won').api.revise('business-a',payload),/Closed opportunity/);
});
test('due follow-ups remain tenant scoped and migrations reversible',async()=>{
 const h=harness();await h.api.due('business-a','2026-11-20T15:00:00Z');
 assert.match(h.calls[0].sql,/tenant_id=\$1/);
 assert.deepEqual(h.calls[0].params,['business-a','2026-11-20T15:00:00Z']);
 assert.match(UP,/CREATE TABLE IF NOT EXISTS reach23_estimates/);
 assert.match(DOWN,/DROP TABLE IF EXISTS reach23_estimates/);
});
