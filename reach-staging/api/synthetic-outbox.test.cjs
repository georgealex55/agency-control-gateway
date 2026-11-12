'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSyntheticOutbox,UP,DOWN}=require('./synthetic-outbox.cjs');
const session=Object.freeze({tenantId:'tenant_A',role:'owner'});
const sessions={resolve:t=>t==='good'?session:null,validCsrf:(t,c)=>c==='csrf'};
function fixture(){
 const rows=[];
 const db={async transaction(fn){return fn({async query(sql,args){
  if(sql.startsWith('INSERT')){
   const old=rows.find(x=>x.tenantId===args[0]&&x.eventKey===args[2]&&x.channel===args[3]);
   if(old)return {rows:[]};
   const row={tenantId:args[0],id:args[1],eventKey:args[2],channel:args[3],status:'pending',attempts:0};rows.push(row);return {rows:[row]};
  }
  if(sql.startsWith('SELECT')){
   const row=rows.find(x=>x.tenantId===args[0]&&(sql.includes('FOR UPDATE')?x.id===args[1]&&x.eventKey===args[2]&&x.channel===args[3]:x.eventKey===args[1]&&x.channel===args[2]));
   return {rows:row?[row]:[]};
  }
  if(sql.startsWith('UPDATE')){
   const row=rows.find(x=>x.tenantId===args[0]&&x.id===args[1]&&x.eventKey===args[2]&&x.channel===args[3]);row.status=args[4];row.attempts=args[5];return {rows:[row]};
  }
  throw Error('unexpected SQL');
 }});}};
 return {rows,db};
}
const base={token:'good',csrf:'csrf',tenantId:'tenant_A',eventKey:'event_1',channel:'sms'};
test('enqueue is tenant-scoped and idempotent',async()=>{
 const {db,rows}=fixture(),api=createSyntheticOutbox({sessions,db});
 const a=await api.run({...base,operation:'enqueue'}),b=await api.run({...base,operation:'enqueue'});
 assert.equal(a.status,201);assert.equal(b.status,200);assert.equal(b.body.duplicate,true);assert.equal(rows.length,1);assert.equal(a.body.providerStatus,'DISCONNECTED');
});
test('authentication, cross-tenant and invalid CSRF fail closed',async()=>{
 const {db,rows}=fixture(),api=createSyntheticOutbox({sessions,db});
 assert.equal((await api.run({...base,token:'bad',operation:'enqueue'})).status,401);
 assert.equal((await api.run({...base,tenantId:'tenant_B',operation:'enqueue'})).status,403);
 assert.equal((await api.run({...base,csrf:'wrong',operation:'enqueue'})).status,403);
 assert.equal(rows.length,0);
});
test('ambiguous acknowledgement requires review and blocks automatic retry',async()=>{
 const {db}=fixture(),api=createSyntheticOutbox({sessions,db});
 const receiptId=(await api.run({...base,operation:'enqueue'})).body.record.id;
 assert.equal((await api.run({...base,receiptId,operation:'ambiguous'})).body.record.status,'needs_review');
 assert.equal((await api.run({...base,receiptId,operation:'retry'})).status,409);
 assert.equal((await api.run({...base,receiptId,operation:'ack'})).status,409);
});
test('acknowledged receipts cannot be acknowledged twice',async()=>{
 const {db}=fixture(),api=createSyntheticOutbox({sessions,db});
 const receiptId=(await api.run({...base,operation:'enqueue'})).body.record.id;
 assert.equal((await api.run({...base,receiptId,operation:'ack'})).status,200);
 assert.equal((await api.run({...base,receiptId,operation:'ack'})).status,409);
});
test('invalid channel and storage failures are redacted',async()=>{
 const {db}=fixture(),api=createSyntheticOutbox({sessions,db});
 assert.equal((await api.run({...base,channel:'live',operation:'enqueue'})).status,400);
 const broken=createSyntheticOutbox({sessions,db:{transaction:async()=>{throw Error('SECRET_DB_URL');}}});
 const response=await broken.run({...base,operation:'enqueue'});
 assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(response),/SECRET_DB_URL/);
});
test('schema is tenant-isolated and reversible',()=>{
 assert.match(UP,/UNIQUE \\(tenant_id,event_key,channel\\)/);
 assert.match(UP,/needs_review/);assert.match(DOWN,/DROP TABLE/);
});
test('retry requires explicit synthetic failure state and increments attempt',async()=>{
 const {db}=fixture(),api=createSyntheticOutbox({sessions,db});
 const receiptId=(await api.run({...base,operation:'enqueue'})).body.record.id;
 assert.equal((await api.run({...base,receiptId,operation:'retry'})).status,409);
 assert.equal((await api.run({...base,receiptId,operation:'mark_retry_ready'})).status,200);
 const retried=await api.run({...base,receiptId,operation:'retry'});
 assert.equal(retried.body.record.attempts,1);assert.equal(retried.body.record.status,'pending');
});
