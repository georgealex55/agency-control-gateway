'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyntheticPipeline,OWNERSHIP_UP,OWNERSHIP_DOWN,NEXT}=require('./pipeline.cjs');
const owner=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
function harness(session=owner,stage='new',verifyTenantMember=async()=>true){
 const calls=[],row={id:'opp-1',stage,owner_user_id:null};
 const db={transaction:async fn=>fn({query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('SELECT id,stage'))return {rows:[{...row}]};
  if(sql.startsWith('UPDATE reach23_opportunities SET stage'))row.stage=params[2];
  if(sql.startsWith('UPDATE reach23_opportunities SET owner_user_id'))row.owner_user_id=params[2];
  return {rows:[]};
 }})};
 return {pipeline:createSyntheticPipeline({db,session,verifyTenantMember}),calls,row};
}
test('stage transitions write tenant-filtered update and actor audit event',async()=>{
 const {pipeline,calls}=harness();
 const result=await pipeline.transition('business-a','opp-1','contacted');
 assert.equal(result.stage,'contacted');
 assert.equal(result.actorId,'owner-a');
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.params[0]==='business-a'));
 assert.deepEqual(calls[2].params.slice(2),['opp-1','new','contacted','owner-a']);
});
test('duplicate stage is a no-op; illegal transition fails closed',async()=>{
 const {pipeline,calls}=harness();
 assert.equal((await pipeline.transition('business-a','opp-1','new')).duplicate,true);
 assert.equal(calls.length,1);
 await assert.rejects(pipeline.transition('business-a','opp-1','won'),/Invalid stage transition/);
 assert.equal(calls.length,2);
 assert.deepEqual(NEXT.won,[]);
});
test('cross-tenant access denied before any database transaction',async()=>{
 const {pipeline,calls}=harness();
 await assert.rejects(pipeline.transition('business-b','opp-1','contacted'),/Forbidden/);
 await assert.rejects(pipeline.assignOwner('business-b','opp-1','owner-b'),/Forbidden/);
 assert.throws(()=>pipeline.history('business-b','opp-1'),/Forbidden/);
 assert.equal(calls.length,0);
});
test('only owner can assign a verified same-tenant member',async()=>{
 const h=harness(owner,'new',async({tenantId,userId})=>tenantId==='business-a'&&userId==='staff-a');
 await assert.rejects(h.pipeline.assignOwner('business-a','opp-1','stranger'),/Owner not found/);
 assert.equal((await h.pipeline.assignOwner('business-a','opp-1','staff-a')).ownerUserId,'staff-a');
 const staff=harness(Object.freeze({tenantId:'business-a',userId:'staff-a',role:'staff'}));
 await assert.rejects(staff.pipeline.assignOwner('business-a','opp-1','staff-a'),/Forbidden/);
});
test('ownership migration is reversible and stage history is scoped',async()=>{
 assert.match(OWNERSHIP_UP,/ADD COLUMN IF NOT EXISTS owner_user_id/);
 assert.match(OWNERSHIP_DOWN,/DROP COLUMN IF EXISTS owner_user_id/);
 const {pipeline,calls}=harness();
 await pipeline.history('business-a','opp-1');
 assert.match(calls[0].sql,/WHERE tenant_id=\$1 AND opportunity_id=\$2/);
 assert.deepEqual(calls[0].params,['business-a','opp-1']);
});
