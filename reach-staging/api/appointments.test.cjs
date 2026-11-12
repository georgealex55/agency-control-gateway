'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAppointmentApi}=require('./appointments.cjs');
const tenantId='synthetic_tenant',contactId='synthetic_contact';
const token='synthetic_token',csrf='synthetic_csrf';
function fixture({missingContact=false,missingAppointment=false,fail=false}={}){
 const queries=[];
 const db={async transaction(fn){return fn({async query(sql,params){
  queries.push({sql,params});
  if(fail)throw Error('private database error');
  if(sql.startsWith('SELECT id FROM reach22_contacts'))return {rows:missingContact?[]:[{id:contactId}]};
  if(sql.startsWith('UPDATE reach22_appointments'))return {rows:missingAppointment?[]:[{id:params[1]}]};
  return {rows:[{id:'synthetic'}]};
 }})}};
 const sessions={resolve:t=>t===token?Object.freeze({userId:'owner1',tenantId,role:'owner'}):null,validCsrf:(t,c)=>t===token&&c===csrf};
 return {api:createAppointmentApi({sessions,db}),queries};
}
const request={token,csrf,tenantId,contactId,scheduledAt:'2026-11-13T12:00:00Z'};
test('create links appointment, timeline and callback completion in one transaction',async()=>{
 const f=fixture(),r=await f.api.handle({...request,action:'create'});
 assert.equal(r.status,201);
 assert.equal(r.body.source,'STAGING_SYNTHETIC');
 assert.ok(f.queries.some(q=>q.sql.includes('INSERT INTO reach22_appointments')));
 assert.ok(f.queries.some(q=>q.sql.includes('INSERT INTO reach22_timeline')));
 assert.ok(f.queries.some(q=>q.sql.includes("SET status='done'")));
 for(const q of f.queries)assert.equal(q.params[0],tenantId);
});
test('reschedule and cancel update active appointment and record timeline without completing tasks',async()=>{
 for(const action of ['reschedule','cancel']){
  const f=fixture(),r=await f.api.handle({...request,action,appointmentId:'appointment1'});
  assert.equal(r.status,200);
  assert.ok(f.queries.some(q=>q.sql.includes('UPDATE reach22_appointments')));
  assert.ok(f.queries.some(q=>q.params.includes('appointment_'+action)));
  assert.ok(!f.queries.some(q=>q.sql.includes('UPDATE reach22_tasks')));
 }
});
test('deny cross tenant, missing auth and bad CSRF without database reads',async()=>{
 const f=fixture();
 assert.equal((await f.api.handle({...request,action:'create',tenantId:'other'})).status,403);
 assert.equal((await f.api.handle({...request,action:'create',token:'bad'})).status,401);
 assert.equal((await f.api.handle({...request,action:'create',csrf:'bad'})).status,403);
 assert.equal(f.queries.length,0);
});
test('reject malformed times, unknown contacts and non-active appointments',async()=>{
 const f=fixture();
 assert.equal((await f.api.handle({...request,action:'create',scheduledAt:'invalid'})).status,400);
 assert.equal((await fixture({missingContact:true}).api.handle({...request,action:'create'})).status,404);
 assert.equal((await fixture({missingAppointment:true}).api.handle({...request,action:'cancel',appointmentId:'a1'})).status,404);
});
test('redact backend failure and do not claim successful booking',async()=>{
 const r=await fixture({fail:true}).api.handle({...request,action:'create'});
 assert.equal(r.status,503);
 assert.ok(!JSON.stringify(r).includes('private database'));
});
