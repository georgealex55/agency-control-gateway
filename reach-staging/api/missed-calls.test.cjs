'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newSessionStore}=require('../auth/session.cjs');
const {createMissedCallIngestor}=require('./missed-calls.cjs');
function fixture(){
 const sessions=newSessionStore(),owner=sessions.issue({userId:'owner-a',tenantId:'tenant-a',role:'owner'});
 const calls=[],receipts=new Set(),contacts=new Map();
 const db={async transaction(fn){
  const receiptSnapshot=new Set(receipts),contactSnapshot=new Map(contacts),length=calls.length;
  try{return await fn({async query(sql,params){
   calls.push({sql,params});
   if(sql.includes('INSERT INTO reach22_event_receipts')){
    const key=params.join(':');if(receipts.has(key))return {rows:[]};
    receipts.add(key);return {rows:[{event_key:params[1]}]};
   }
   if(sql.startsWith('SELECT id FROM reach22_contacts'))return {rows:contacts.has(params[0]+':'+params[1])?[{id:contacts.get(params[0]+':'+params[1])}]:[]};
   if(sql.startsWith('INSERT INTO reach22_contacts'))contacts.set(params[0]+':'+params[3],params[1]);
   return {rows:[{}]};
  }});}catch(e){receipts.clear();for(const k of receiptSnapshot)receipts.add(k);contacts.clear();for(const [k,v] of contactSnapshot)contacts.set(k,v);calls.length=length;throw e;}
 }};
 return {sessions,owner,calls,receipts,contacts,db,api:createMissedCallIngestor({sessions,db}),req:{token:owner.token,csrf:owner.csrf,tenantId:'tenant-a',eventKey:'missed-1',phone:'+14155550123',occurredAt:'2026-11-12T10:00:00.000Z'}};
}
test('rejects forged identity, cross-tenant requests, CSRF and malformed events before storage',async()=>{
 const f=fixture();
 assert.equal((await f.api.ingest({...f.req,token:'demo@reach.local'})).status,401);
 assert.equal((await f.api.ingest({...f.req,tenantId:'tenant-b'})).status,403);
 assert.equal((await f.api.ingest({...f.req,csrf:'wrong'})).status,403);
 assert.equal((await f.api.ingest({...f.req,phone:'555-0123'})).status,400);
 assert.equal((await f.api.ingest({...f.req,eventKey:'../bad'})).status,400);
 assert.equal(f.calls.length,0);
});
test('one missed call creates synthetic contact, call and callback task in a transaction',async()=>{
 const f=fixture(),res=await f.api.ingest(f.req);
 assert.equal(res.status,201);assert.equal(res.body.connected,false);
 assert.equal(f.calls.filter(c=>c.sql.includes('INSERT INTO reach22_tasks')).length,1);
 assert.equal(f.calls.filter(c=>c.sql.includes('INSERT INTO reach22_calls')).length,1);
 assert.ok(f.calls.every(c=>c.params[0]==='tenant-a'));
});
test('same tenant event replay is deduplicated without creating a second callback',async()=>{
 const f=fixture();await f.api.ingest(f.req);
 const again=await f.api.ingest(f.req);
 assert.equal(again.status,200);assert.equal(again.body.duplicate,true);
 assert.equal(f.calls.filter(c=>c.sql.includes('INSERT INTO reach22_tasks')).length,1);
});
test('matching contact is reused and other tenant receipt does not suppress event',async()=>{
 const f=fixture();await f.api.ingest(f.req);
 await f.api.ingest({...f.req,eventKey:'missed-2'});
 assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT INTO reach22_contacts')).length,1);
 const ownerB=f.sessions.issue({userId:'owner-b',tenantId:'tenant-b',role:'owner'});
 const b=await f.api.ingest({...f.req,token:ownerB.token,csrf:ownerB.csrf,tenantId:'tenant-b'});
 assert.equal(b.status,201);
 assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT INTO reach22_contacts')).length,2);
});
test('storage failure is redacted and transaction rollback is delegated to adapter',async()=>{
 const sessions=newSessionStore(),owner=sessions.issue({userId:'owner',tenantId:'tenant-a',role:'owner'});
 const api=createMissedCallIngestor({sessions,db:{transaction:async()=>{throw Error('SECRET DATABASE URL')}}});
 const result=await api.ingest({token:owner.token,csrf:owner.csrf,tenantId:'tenant-a',eventKey:'event-1',phone:'+14155550123',occurredAt:'2026-11-12T10:00:00.000Z'});
 assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});
