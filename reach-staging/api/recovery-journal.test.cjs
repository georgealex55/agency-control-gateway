'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRecoveryJournal,createMemoryJournalStore}=require('./recovery-journal.cjs');
const session=Object.freeze({tenantId:'business1',userId:'owner1',role:'owner'});
const event={eventKey:'event1',reviewId:'review1',opportunityId:'opp1',kind:'callback',version:2};
const make=(store=createMemoryJournalStore(),s=session)=>createRecoveryJournal({session:s,store,clock:()=>new Date('2026-11-13T16:00:00Z')});
const opts={csrfVerified:true,currentVersion:2};
test('concurrent duplicate record writes one synthetic receipt',async()=>{
 const a=make(),result=await Promise.all([a.record('business1',event,opts),a.record('business1',event,opts)]);
 assert.deepEqual(result.map(x=>x.duplicate).sort(),[false,true]);
 assert.equal((await a.replay('business1',{csrfVerified:true})).length,1);
});
test('replay after service recreation uses injected store, no external dispatch',async()=>{
 const store=createMemoryJournalStore(),a=make(store);
 await a.record('business1',event,opts);
 const b=make(store),rows=await b.replay('business1',{csrfVerified:true});
 assert.equal(rows[0].status,'PENDING_SIMULATION');
 const completed=await b.reconcile('business1','event1',{csrfVerified:true,mode:'simulate'});
 assert.equal(completed.status,'SIMULATED_ONLY');assert.equal(completed.dispatched,false);
 assert.equal((await make(store).reconcile('business1','event1',{csrfVerified:true,mode:'simulate'})).status,'SIMULATED_ONLY');
});
test('ambiguous receipt is held for review and cannot auto-retry',async()=>{
 const a=make();await a.record('business1',event,opts);
 assert.equal((await a.reconcile('business1','event1',{csrfVerified:true,mode:'ambiguous'})).status,'NEEDS_REVIEW');
 assert.equal((await a.reconcile('business1','event1',{csrfVerified:true,mode:'simulate'})).status,'NEEDS_REVIEW');
});
test('stale version and mismatched duplicate idempotency are rejected',async()=>{
 const a=make();await assert.rejects(a.record('business1',event,{...opts,currentVersion:3}),{code:'STALE_APPROVAL'});
 await a.record('business1',event,opts);
 await assert.rejects(a.record('business1',{...event,kind:'booking'},opts),{code:'IDEMPOTENCY_CONFLICT'});
 assert.equal((await a.replay('business1',{csrfVerified:true}))[0].kind,'callback');
});
test('cross tenant and staff denied before touching store, CSRF required',async()=>{
 let calls=0;const store={transaction:async()=>{calls++;throw Error('MUST_NOT_RUN');}};
 const a=make(store);
 await assert.rejects(a.record('business2',event,opts),{code:'FORBIDDEN'});
 await assert.rejects(a.record('business1',event,{...opts,csrfVerified:false}),{code:'CSRF_REQUIRED'});
 await assert.rejects(make(store,Object.freeze({...session,role:'staff'})).replay('business1',{csrfVerified:true}),{code:'FORBIDDEN'});
 assert.equal(calls,0);
});
test('transaction failure rolls back event and permits safe retry',async()=>{
 const store=createMemoryJournalStore(),a=make(store);
 await assert.rejects(store.transaction(async tx=>{await tx.put('business1:event1',{...event,tenantId:'business1'});throw Error('CRASH');}),/CRASH/);
 assert.equal((await a.replay('business1',{csrfVerified:true})).length,0);
 assert.equal((await a.record('business1',event,opts)).duplicate,false);
});
