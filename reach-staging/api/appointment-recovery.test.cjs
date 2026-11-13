'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAppointmentRecovery,UP,DOWN}=require('./appointment-recovery.cjs');
const session=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
function fixture({status='pending',missing=false,fail=false}={}){
 const calls=[];
 const db={transaction:async fn=>fn({query:async(sql,params)=>{
  calls.push({sql,params});
  if(fail&&sql.includes('INSERT INTO reach23_appointment_reminders'))throw Error('synthetic rollback');
  if(sql.startsWith('SELECT id,opportunity_id'))return {rows:missing?[]:[{id:'apt-1',opportunity_id:'opp-1',contact_id:'contact-1',status}]};
  if(sql.startsWith('SELECT id FROM'))return {rows:missing?[]:[{id:'found'}]};
  return {rows:[]};
 }})};
 return {api:createAppointmentRecovery({db,session}),calls};
}
const create={opportunityId:'opp-1',contactId:'contact-1',scheduledAt:'2026-11-20T15:00:00.000Z'};
test('creates pending synthetic appointment and internal reminder in one transaction',async()=>{
 const f=fixture(),r=await f.api.create('business-a',create);
 assert.equal(r.status,'pending');assert.equal(r.dispatched,false);
 assert.equal(f.calls.filter(x=>x.sql.includes('INSERT INTO')).length,2);
 assert.ok(f.calls.every(x=>x.params[0]==='business-a'));
});
test('confirmation and no-show transitions remain tenant-scoped',async()=>{
 for(const [action,expected] of [['confirm','confirmed'],['no_show','no_show'],['cancel','cancelled']]){
  const f=fixture(),r=await f.api.transition('business-a',{appointmentId:'apt-1',action});
  assert.equal(r.status,expected);assert.equal(r.dispatched,false);
  assert.ok(f.calls.some(x=>x.sql.includes('UPDATE reach23_appointment_recovery')));
 }
});
test('rebooking creates linked pending appointment and queued reminder',async()=>{
 const f=fixture({status:'no_show'});
 const r=await f.api.transition('business-a',{appointmentId:'apt-1',action:'rebook',scheduledAt:create.scheduledAt});
 assert.equal(r.priorId,'apt-1');assert.equal(r.dispatched,false);
 assert.ok(f.calls.some(x=>x.sql.includes('prior_id,actor_id')));
 assert.ok(f.calls.some(x=>x.sql.includes("'rebooking'")));
});
test('invalid transitions, bad dates and cross-tenant requests reject without side effects',async()=>{
 const f=fixture({status:'confirmed'});
 await assert.rejects(f.api.transition('business-a',{appointmentId:'apt-1',action:'rebook',scheduledAt:create.scheduledAt}),/Invalid appointment transition/);
 const n=f.calls.length;
 await assert.rejects(f.api.create('business-b',create),/Forbidden/);
 await assert.rejects(f.api.create('business-a',{...create,scheduledAt:'bad'}),/Invalid synthetic appointment/);
 assert.equal(f.calls.length,n);
});
test('missing records and injected reminder failure reject; schema is reversible',async()=>{
 await assert.rejects(fixture({missing:true}).api.create('business-a',create),/not found/);
 await assert.rejects(fixture({fail:true}).api.create('business-a',create),/synthetic rollback/);
 assert.match(UP,/CREATE TABLE IF NOT EXISTS reach23_appointment_recovery/);
 assert.match(DOWN,/DROP TABLE IF EXISTS reach23_appointment_recovery/);
});
