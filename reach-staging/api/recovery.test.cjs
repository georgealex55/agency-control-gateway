'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyntheticRecovery}=require('./recovery.cjs');
const owner=Object.freeze({tenantId:'tenant-a',userId:'owner-a',role:'owner'});
function fixture(){
 const receipts=new Set(),leads=new Map(),contacts=new Map(),tasks=[],opportunities=[],calls=[],queries=[];
 const db={async transaction(fn){
  // Synthetic snapshot rollback; not a real PostgreSQL test.
  const old={receipts:new Set(receipts),leads:new Map(leads),contacts:new Map(contacts),taskCount:tasks.length,oppCount:opportunities.length,callCount:calls.length};
  try{return await fn({async query(sql,p){
   queries.push({sql,p});
   if(sql.startsWith('INSERT INTO reach22_event_receipts')){
    const k=p[0]+':'+p[1];if(receipts.has(k))return {rows:[]};
    receipts.add(k);return {rows:[{event_key:p[1]}]};
   }
   if(sql.startsWith('INSERT INTO reach23_leads')){
    const k=p[0]+':'+p[2]+':'+p[3];if(leads.has(k))return {rows:[]};
    leads.set(k,{id:p[1],contactId:null});return {rows:[{id:p[1]}]};
   }
   if(sql.startsWith('SELECT id FROM reach22_contacts'))return {rows:[...contacts.values()].filter(c=>c.tenant===p[0]&&((p[1]&&c.phone===p[1])||(p[2]&&c.email===p[2]))).slice(0,1)};
   if(sql.startsWith('INSERT INTO reach22_contacts')){contacts.set(p[0]+':'+p[1],{id:p[1],tenant:p[0],phone:p[3],email:p[4]});return {rows:[]};}
   if(sql.startsWith('UPDATE reach23_leads')){for(const l of leads.values())if(l.id===p[1])l.contactId=p[2];return {rows:[]};}
   if(sql.startsWith('INSERT INTO reach22_calls')){calls.push(p);return {rows:[]};}
   if(sql.startsWith('INSERT INTO reach22_tasks')){tasks.push(p);return {rows:[]};}
   if(sql.startsWith('INSERT INTO reach23_opportunities')){opportunities.push(p);return {rows:[]};}
   throw Error('Unexpected SQL '+sql);
  }});}catch(e){
   receipts.clear();for(const k of old.receipts)receipts.add(k);
   leads.clear();for(const [k,v] of old.leads)leads.set(k,v);
   contacts.clear();for(const [k,v] of old.contacts)contacts.set(k,v);
   tasks.length=old.taskCount;opportunities.length=old.oppCount;calls.length=old.callCount;throw e;
  }
 }};
 return {db,receipts,leads,contacts,tasks,opportunities,calls,queries};
}
const missed={sourceType:'missed_call',sourceRef:'call-100',phone:'+14155550123',occurredAt:'2026-11-13T00:00:00Z'};
const inquiry={sourceType:'inquiry',sourceRef:'inquiry-100',email:'CUSTOMER@EXAMPLE.COM',occurredAt:'2026-11-13T00:00:00Z'};
test('missed call creates one contact, call, callback, lead and opportunity; replay does not duplicate',async()=>{
 const f=fixture(),api=createSyntheticRecovery({db:f.db,session:owner});
 const a=await api.ingest('tenant-a',missed),b=await api.ingest('tenant-a',missed);
 assert.equal(a.duplicate,false);assert.equal(b.duplicate,true);assert.equal(a.connected,false);
 assert.equal(f.receipts.size,1);assert.equal(f.leads.size,1);assert.equal(f.contacts.size,1);
 assert.equal(f.calls.length,1);assert.equal(f.tasks.length,1);assert.equal(f.opportunities.length,1);
 assert.equal(f.tasks[0][3],a.callId);assert.equal(f.opportunities[0][2],a.leadId);
 assert.ok(f.queries.every(q=>q.p[0]==='tenant-a'));
});
test('unanswered inquiry creates callback without fictitious call and reuses matching contact',async()=>{
 const f=fixture(),api=createSyntheticRecovery({db:f.db,session:owner});
 const a=await api.ingest('tenant-a',inquiry);
 const b=await api.ingest('tenant-a',{...inquiry,sourceRef:'inquiry-101',email:'customer@example.com'});
 assert.equal(a.contactId,b.contactId);assert.equal(f.contacts.size,1);
 assert.equal(f.tasks.length,2);assert.equal(f.calls.length,0);
 assert.equal(f.tasks[0][3],null);assert.equal(f.opportunities.length,2);
});
test('cross-tenant denial occurs before transaction and malformed events fail closed',async()=>{
 const f=fixture(),api=createSyntheticRecovery({db:f.db,session:owner});
 await assert.rejects(api.ingest('tenant-b',missed),/Forbidden/);
 for(const event of [{...missed,sourceRef:'../bad'}, {...missed,phone:'123'}, {...missed,occurredAt:'invalid'}, {...missed,tenantId:'tenant-b'}, {...inquiry,email:'bad'}, {...inquiry,sourceType:'social_post'}])
  await assert.rejects(api.ingest('tenant-a',event),TypeError);
 assert.equal(f.queries.length,0);
});
test('separate businesses may use same event key without sharing records',async()=>{
 const f=fixture(),a=createSyntheticRecovery({db:f.db,session:owner});
 const b=createSyntheticRecovery({db:f.db,session:Object.freeze({tenantId:'tenant-b',userId:'owner-b',role:'owner'})});
 await a.ingest('tenant-a',missed);await b.ingest('tenant-b',missed);
 assert.equal(f.receipts.size,2);assert.equal(f.contacts.size,2);assert.equal(f.tasks.length,2);
});
test('transaction failure rolls back synthetic receipt and callback',async()=>{
 const f=fixture(),api=createSyntheticRecovery({db:{transaction:fn=>f.db.transaction(async tx=>fn({query:async(sql,p)=>{
  if(sql.startsWith('INSERT INTO reach22_tasks'))throw Error('synthetic injected task failure');
  return tx.query(sql,p);
 } }))},session:owner});
 await assert.rejects(api.ingest('tenant-a',missed),/injected task failure/);
 assert.equal(f.receipts.size,0);assert.equal(f.leads.size,0);assert.equal(f.contacts.size,0);assert.equal(f.calls.length,0);
 assert.equal(f.tasks.length,0);assert.equal(f.opportunities.length,0);
});
