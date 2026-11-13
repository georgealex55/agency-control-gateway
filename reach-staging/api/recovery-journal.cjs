'use strict';
// REACH 2.3: offline-only durable-adapter contract. No provider dispatch.
const {createHash}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const KINDS=new Set(['callback','task','booking']);
function failure(code){const e=new Error(code);e.code=code;throw e;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function createRecoveryJournal({session,store,clock=()=>new Date()}={}){
 if(!session||!Object.isFrozen(session)||!store||typeof store.transaction!=='function'||typeof clock!=='function')throw new TypeError('Trusted journal dependencies required');
 const authorize=(tenantId,action)=>assertTenantAccess({session,tenantId,action,requiredRole:'owner'});
 const key=(tenantId,eventKey)=>tenantId+':'+eventKey;
 function validate(event){if(!event||!ID.test(event.eventKey||'')||!ID.test(event.opportunityId||'')||!KINDS.has(event.kind)||!Number.isSafeInteger(event.version)||event.version<0||!ID.test(event.reviewId||''))failure('INVALID_EVENT');}
 return Object.freeze({
  async record(tenantId,event,{csrfVerified=false,currentVersion}={}){
   authorize(tenantId,'update');
   if(csrfVerified!==true)failure('CSRF_REQUIRED');
   validate(event);
   if(!Number.isSafeInteger(currentVersion)||currentVersion!==event.version)failure('STALE_APPROVAL');
   const now=clock().toISOString(),id=key(tenantId,event.eventKey);
   return store.transaction(async tx=>{
    const prior=await tx.get(id);
    if(prior){
     if(prior.tenantId!==tenantId||prior.reviewId!==event.reviewId||prior.opportunityId!==event.opportunityId||prior.kind!==event.kind||prior.version!==event.version)failure('IDEMPOTENCY_CONFLICT');
     return Object.freeze({duplicate:true,receipt:clone(prior)});
    }
    const receipt={id,tenantId,eventKey:event.eventKey,reviewId:event.reviewId,opportunityId:event.opportunityId,kind:event.kind,version:event.version,status:'PENDING_SIMULATION',source:'STAGING_SYNTHETIC',dispatched:false,connected:false,createdAt:now};
    await tx.put(id,receipt);return Object.freeze({duplicate:false,receipt:clone(receipt)});
   });
  },
  async reconcile(tenantId,eventKey,{csrfVerified=false,mode='inspect'}={}){
   authorize(tenantId,'update');
   if(csrfVerified!==true)failure('CSRF_REQUIRED');
   if(!ID.test(eventKey||'')||!['inspect','simulate','ambiguous'].includes(mode))failure('INVALID_EVENT');
   const id=key(tenantId,eventKey);
   return store.transaction(async tx=>{
    const prior=await tx.get(id);
    if(!prior||prior.tenantId!==tenantId)failure('NOT_FOUND');
    if(mode==='inspect')return clone(prior);
    if(prior.status==='SIMULATED_ONLY'||prior.status==='NEEDS_REVIEW')return clone(prior);
    const next={...prior,status:mode==='ambiguous'?'NEEDS_REVIEW':'SIMULATED_ONLY',dispatched:false,connected:false};
    await tx.put(id,next);return clone(next);
   });
  },
  async replay(tenantId,{csrfVerified=false}={}){
   authorize(tenantId,'read');
   if(csrfVerified!==true)failure('CSRF_REQUIRED');
   return store.transaction(async tx=>{
    const rows=await tx.list(tenantId);
    return Object.freeze(rows.filter(r=>r.tenantId===tenantId).map(r=>Object.freeze(clone(r))).sort((a,b)=>a.eventKey.localeCompare(b.eventKey)));
   });
  }
 });
}
// In-memory adapter for deterministic tests only. Real persistence requires an
// atomic, tenant-scoped transaction adapter with get/put/list and durable commit.
function createMemoryJournalStore(){
 const records=new Map();
 let queue=Promise.resolve();
 return Object.freeze({
  transaction(fn){
   const task=queue.then(async()=>{
    const draft=new Map([...records].map(([k,v])=>[k,clone(v)]));
    const tx=Object.freeze({
     get:async k=>clone(draft.get(k)||null),
     put:async(k,v)=>{draft.set(k,clone(v));},
     list:async tenantId=>[...draft.values()].filter(v=>v.tenantId===tenantId).map(clone)
    });
    const result=await fn(tx);
    records.clear();for(const [k,v] of draft)records.set(k,v);
    return result;
   });
   queue=task.catch(()=>{});return task;
  }
 });
}
module.exports={createRecoveryJournal,createMemoryJournalStore};
