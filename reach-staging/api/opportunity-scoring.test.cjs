'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scoreOpportunity,createOpportunityScoring,assumptions}=require('./opportunity-scoring.cjs');
const asOf='2026-11-13T12:00:00.000Z';
const row={id:'opp-1',stage:'quoted',source_type:'missed_call',amount_cents:100000,created_at:'2026-11-10T12:00:00.000Z',updated_at:'2026-11-12T12:00:00.000Z',followup_due_at:'2026-11-12T12:00:00.000Z'};
const session=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
test('deterministic score includes reason codes and integer-cent expected value',()=>{
 const a=scoreOpportunity(row,{asOf}),b=scoreOpportunity(row,{asOf});
 assert.deepEqual(a,b);assert.equal(a.probabilityBps,5700);
 assert.equal(a.estimatedRecoverableCents,57000);
 assert.deepEqual(a.reasons,['MISSED_CALL','QUOTE_PENDING','FOLLOWUP_DUE']);
 assert.equal(a.dispatched,false);
});
test('closed opportunities never count as recoverable revenue',()=>{
 for(const stage of ['won','lost']){
  const r=scoreOpportunity({...row,stage},{asOf});
  assert.equal(r.estimatedRecoverableCents,0);assert.equal(r.priority,'closed');
 }
});
test('stale opportunities, caps and invalid assumptions fail safely',()=>{
 const stale=scoreOpportunity({...row,updated_at:'2025-01-01T00:00:00.000Z'},{asOf});
 assert.equal(stale.estimatedRecoverableCents,0);
 assert.equal(scoreOpportunity(row,{asOf,config:{maxProbabilityBps:3000}}).probabilityBps,3000);
 assert.throws(()=>assumptions({unknown:1}),/Invalid/);
 assert.throws(()=>scoreOpportunity({...row,amount_cents:-1},{asOf}),/Invalid/);
});
test('tenant denial happens before SQL and invalid date is rejected',async()=>{
 let queried=0;
 const api=createOpportunityScoring({session,db:{transaction:async f=>f({query:async()=>{queried++;return {rows:[]};}})}});
 await assert.rejects(api.rank('business-b',{asOf}),/Forbidden/);
 await assert.rejects(api.rank('business-a',{asOf:'tomorrow'}),/Invalid/);
 assert.equal(queried,0);
});
test('ranking uses tenant-bound SQL and latest estimate without outbound dispatch',async()=>{
 const calls=[];
 const api=createOpportunityScoring({session,db:{transaction:async f=>f({query:async(sql,params)=>{calls.push({sql,params});return {rows:[row,{...row,id:'opp-2',stage:'won'}]};}})}});
 const result=await api.rank('business-a',{asOf});
 assert.equal(result.entries.length,2);
 assert.equal(result.totalEstimatedRecoverableCents,57000);
 assert.equal(result.connected,false);assert.equal(result.dispatched,false);
 assert.match(calls[0].sql,/WHERE o.tenant_id=\$1/);
 assert.match(calls[0].sql,/ORDER BY revision DESC/);
 assert.deepEqual(calls[0].params,['business-a',asOf,50]);
});
