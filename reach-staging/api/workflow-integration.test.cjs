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


const {createSyntheticLeadIntake}=require('./lead-intake.cjs');
const {createSyntheticPipeline}=require('./pipeline.cjs');
const {createSyntheticEstimates}=require('./estimates.cjs');
const {createDailyBriefing}=require('./daily-briefing.cjs');
test('REACH 2.3 owner journey: missed call, matched lead, estimate, pipeline and deterministic report',async()=>{
 const sessions=newSessionStore(),base=adapter();
 const owner=sessions.issue({userId:'owner_a',tenantId:'tenant_a',role:'owner'});
 const trustedOwner=sessions.resolve(owner.token);
 const stranger=sessions.issue({userId:'owner_b',tenantId:'tenant_b',role:'owner'});
 const state={leads:[],opportunities:[],estimates:[],followups:[],events:[]};
 const db={...base,async transaction(fn){
  const snapshot=structuredClone(state);
  try{return await base.transaction(tx=>fn({query:async(sql,p)=>{
   const tenant=p[0],scoped=k=>state[k].filter(x=>x.tenant===tenant);
   if(sql.startsWith('INSERT INTO reach23_leads')){
    if(scoped('leads').some(x=>x.type===p[2]&&x.ref===p[3]))return {rows:[]};
    state.leads.push({tenant,id:p[1],type:p[2],ref:p[3]});return {rows:[{id:p[1]}]};
   }
   if(sql.startsWith('SELECT id,contact_id FROM reach23_leads'))return {rows:scoped('leads').filter(x=>x.type===p[1]&&x.ref===p[2]).map(x=>({id:x.id,contact_id:x.contactId}))};
   if(sql.startsWith('UPDATE reach23_leads')){scoped('leads').find(x=>x.id===p[1]).contactId=p[2];return {rows:[]};}
   if(sql.startsWith('INSERT INTO reach23_opportunities')){state.opportunities.push({tenant,id:p[1],leadId:p[2],stage:'new'});return {rows:[]};}
   if(sql.startsWith('SELECT id,stage,owner_user_id FROM reach23_opportunities'))return {rows:scoped('opportunities').filter(x=>x.id===p[1]).map(x=>({...x,owner_user_id:null}))};
   if(sql.startsWith('SELECT id,stage FROM reach23_opportunities'))return {rows:scoped('opportunities').filter(x=>x.id===p[1])};
   if(sql.startsWith('UPDATE reach23_opportunities SET stage=')){scoped('opportunities').find(x=>x.id===p[1]).stage=p[2];return {rows:[]};}
   if(sql.startsWith('INSERT INTO reach23_stage_events')){state.events.push({tenant,id:p[1],opportunityId:p[2],stage:p[4]});return {rows:[]};}
   if(sql.startsWith('SELECT COALESCE(MAX(revision)'))return {rows:[{revision:scoped('estimates').filter(x=>x.opportunityId===p[1]).length}]};
   if(sql.startsWith('INSERT INTO reach23_estimates')){state.estimates.push({tenant,id:p[1],opportunityId:p[2],revision:p[3],amount:p[4]});return {rows:[]};}
   if(sql.startsWith('INSERT INTO reach23_estimate_followups')){state.followups.push({tenant,id:p[1],estimateId:p[2],opportunityId:p[3],due:p[4],status:'open'});return {rows:[]};}
   if(sql.startsWith('UPDATE reach23_estimate_followups'))return {rows:[]};
   if(sql.includes('FROM reach23_opportunities o')&&sql.includes('JOIN reach23_leads')){
    return {rows:scoped('opportunities').map(o=>{
     const lead=scoped('leads').find(x=>x.id===o.leadId);
     const estimate=scoped('estimates').find(x=>x.opportunityId===o.id);
     const follow=scoped('followups').find(x=>x.estimateId===estimate?.id);
     return {id:o.id,stage:o.stage,source_type:lead.type,created_at:'2026-11-13T10:00:00.000Z',updated_at:'2026-11-13T10:00:00.000Z',amount_cents:estimate?.amount||0,followup_due_at:follow?.due||null};
    })};
   }
   return tx.query(sql,p);
  }}));}catch(e){for(const k of Object.keys(state))state[k]=snapshot[k];throw e;}
 }};
 const missed=createMissedCallIngestor({sessions,db});
 const intake=createSyntheticLeadIntake({db,session:trustedOwner});
 const pipeline=createSyntheticPipeline({db,session:trustedOwner});
 const estimates=createSyntheticEstimates({db,session:trustedOwner});
 const briefing=createDailyBriefing({db,session:trustedOwner});
 const dashboard=createDashboardSelectors({sessions,db});
 const request={token:owner.token,csrf:owner.csrf,tenantId:'tenant_a',eventKey:'call14',phone:'+14155550123',occurredAt:'2026-11-12T10:00:00Z'};
 const first=await missed.ingest(request);assert.equal(first.status,201);
 const lead=await intake.ingest('tenant_a',{sourceType:'missed_call',sourceRef:first.body.callId,contactId:first.body.contactId});
 assert.equal(lead.contactId,first.body.contactId);
 assert.equal((await missed.ingest(request)).body.duplicate,true);
 assert.equal((await intake.ingest('tenant_a',{sourceType:'missed_call',sourceRef:first.body.callId,contactId:first.body.contactId})).duplicate,true);
 assert.equal(base.state.tasks.length,1);
 assert.equal((await pipeline.transition('tenant_a',lead.opportunityId,'contacted')).stage,'contacted');
 const estimate=await estimates.revise('tenant_a',{opportunityId:lead.opportunityId,amountCents:150000,followUpAt:'2026-11-13T12:00:00.000Z'});
 assert.equal(estimate.dispatched,false);
 assert.equal((await pipeline.transition('tenant_a',lead.opportunityId,'quoted')).stage,'quoted');
 const report=await briefing.forOwner('tenant_a',{asOf:'2026-11-13T16:00:00.000Z'});
 assert.equal(report.counts.open,1);
 assert.equal(report.suggestions.length,1);
 assert.equal(report.suggestions[0].command.approvalRequired,true);
 assert.equal(report.suggestions[0].command.execution,'DISABLED');
 assert.ok(report.estimatedRecoverableCents>0);
 assert.match(report.metricLabel,/not actual revenue/i);
 assert.equal((await dashboard.read({token:owner.token,tenantId:'tenant_a'})).body.metrics.openCallbacks,1);
 assert.equal((await dashboard.read({token:stranger.token,tenantId:'tenant_a'})).status,403);
 assert.equal((await dashboard.read({token:stranger.token,tenantId:'tenant_b'})).body.metrics.missedCalls,0);
 await assert.rejects(()=>briefing.forOwner('tenant_b',{asOf:'2026-11-13T16:00:00.000Z'}),/Forbidden/);
 assert.equal(state.events.length,2);
 assert.equal(state.estimates.length,1);
 assert.equal(state.followups.length,1);
});
