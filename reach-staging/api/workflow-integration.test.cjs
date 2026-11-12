'use strict';
// Native Node synthetic integration: trusted in-memory adapter, NO HTTP/browser/Neon/provider calls.
const test=require('node:test');
const assert=require('node:assert/strict');
const {newSessionStore}=require('../auth/session.cjs');
const {createMissedCallIngestor}=require('./missed-calls.cjs');
const {createAppointmentApi}=require('./appointments.cjs');
const {createDashboardSelectors}=require('./dashboard.cjs');
function adapter(){
 const state={contacts:[],calls:[],tasks:[],appointments:[],timeline:[],receipts:new Set()};
 const copy=()=>({contacts:structuredClone(state.contacts),calls:structuredClone(state.calls),tasks:structuredClone(state.tasks),appointments:structuredClone(state.appointments),timeline:structuredClone(state.timeline),receipts:new Set(state.receipts)});
 const restore=s=>{for(const k of ['contacts','calls','tasks','appointments','timeline'])state[k]=s[k];state.receipts=s.receipts;};
 async function query(sql,p){
  const tenant=p[0];
  if(sql.includes('INSERT INTO reach22_event_receipts')){
   const key=tenant+':'+p[1];if(state.receipts.has(key))return {rows:[]};
   state.receipts.add(key);return {rows:[{event_key:p[1]}]};
  }
  if(sql.startsWith('SELECT id FROM reach22_contacts')){
   const rows=state.contacts.filter(c=>c.tenant===tenant&&(sql.includes('phone=$2')?c.phone===p[1]:c.id===p[1]));
   return {rows:rows.map(c=>({id:c.id}))};
  }
  if(sql.startsWith('INSERT INTO reach22_contacts')){state.contacts.push({tenant,id:p[1],phone:p[3]});return {rows:[{}]};}
  if(sql.startsWith('INSERT INTO reach22_calls')){state.calls.push({tenant,id:p[1],contactId:p[2],outcome:'missed'});return {rows:[{}]};}
  if(sql.startsWith('INSERT INTO reach22_tasks')){state.tasks.push({tenant,id:p[1],contactId:p[2],status:'open'});return {rows:[{}]};}
  if(sql.startsWith('INSERT INTO reach22_appointments')){state.appointments.push({tenant,id:p[1],contactId:p[2],at:p[3],status:'scheduled'});return {rows:[{}]};}
  if(sql.startsWith('INSERT INTO reach22_timeline')){state.timeline.push({tenant,id:p[1],contactId:p[2],event_type:p[4],occurred_at:new Date().toISOString()});return {rows:[{}]};}
  if(sql.startsWith('UPDATE reach22_tasks')){for(const t of state.tasks)if(t.tenant===tenant&&t.contactId===p[1]&&t.status==='open')t.status='done';return {rows:[{}]};}
  if(sql.startsWith('UPDATE reach22_appointments')){
   const a=state.appointments.find(a=>a.tenant===tenant&&a.id===p[1]&&a.contactId===p[2]&&a.status==='scheduled');
   if(!a)return {rows:[]};
   if(sql.includes("status='cancelled'"))a.status='cancelled';else a.at=p[3];
   return {rows:[{id:a.id}]};
  }
  if(sql.includes('count(*)::int')){
   let list=sql.includes('reach22_contacts')?state.contacts:sql.includes('reach22_calls')?state.calls:sql.includes('reach22_tasks')?state.tasks:state.appointments;
   list=list.filter(x=>x.tenant===tenant);
   if(sql.includes("outcome='missed'"))list=list.filter(x=>x.outcome==='missed');
   if(sql.includes("status='open'"))list=list.filter(x=>x.status==='open');
   if(sql.includes("status='done'"))list=list.filter(x=>x.status==='done');
   if(sql.includes("status='scheduled'"))list=list.filter(x=>x.status==='scheduled');
   return {rows:[{value:list.length}]};
  }
  if(sql.includes('FROM reach22_timeline'))return {rows:state.timeline.filter(x=>x.tenant===tenant).slice(-10).reverse().map(x=>({event_type:x.event_type,occurred_at:x.occurred_at}))};
  throw Error('Unsupported synthetic SQL');
 }
 return {state,query,async transaction(fn){const snapshot=copy();try{return await fn({query});}catch(e){restore(snapshot);throw e;}}};
}
test('synthetic owner journey: missed call, contact, callback, appointment and tenant-isolated dashboard',async()=>{
 const sessions=newSessionStore(),db=adapter();
 const a=sessions.issue({userId:'owner_a',tenantId:'tenant_a',role:'owner'});
 const b=sessions.issue({userId:'owner_b',tenantId:'tenant_b',role:'owner'});
 const calls=createMissedCallIngestor({sessions,db}),appointments=createAppointmentApi({sessions,db}),dashboard=createDashboardSelectors({sessions,db});
 const req={token:a.token,csrf:a.csrf,tenantId:'tenant_a',eventKey:'call_001',phone:'+14155550123',occurredAt:'2026-11-12T10:00:00Z'};
 const first=await calls.ingest(req);
 assert.equal(first.status,201,JSON.stringify(first));
 assert.equal(db.state.contacts.length,1);
 assert.equal(db.state.tasks[0].status,'open');
 const replay=await calls.ingest(req);
 assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);
 assert.equal(db.state.tasks.length,1);
 const before=await dashboard.read({token:a.token,tenantId:'tenant_a'});
 assert.equal(before.status,200,JSON.stringify(before));
 assert.deepEqual(before.body.metrics,{contacts:1,missedCalls:1,openCallbacks:1,appointments:0,completedCallbacks:0});
 const book=await appointments.handle({token:a.token,csrf:a.csrf,tenantId:'tenant_a',action:'create',contactId:first.body.contactId,scheduledAt:'2026-11-13T12:00:00Z'});
 assert.equal(book.status,201,JSON.stringify(book));
 const after=await dashboard.read({token:a.token,tenantId:'tenant_a'});
 assert.deepEqual(after.body.metrics,{contacts:1,missedCalls:1,openCallbacks:0,appointments:1,completedCallbacks:1});
 assert.equal(after.body.activity[0].type,'appointment_create');
 assert.equal(after.body.providerStatus,'DISCONNECTED');
 assert.equal((await dashboard.read({token:b.token,tenantId:'tenant_a'})).status,403);
 const empty=await dashboard.read({token:b.token,tenantId:'tenant_b'});
 assert.deepEqual(empty.body.metrics,{contacts:0,missedCalls:0,openCallbacks:0,appointments:0,completedCallbacks:0});
 assert.equal((await appointments.handle({token:b.token,csrf:b.csrf,tenantId:'tenant_a',action:'cancel',contactId:first.body.contactId,appointmentId:book.body.id})).status,403);
 assert.equal(db.state.appointments[0].status,'scheduled');
});
