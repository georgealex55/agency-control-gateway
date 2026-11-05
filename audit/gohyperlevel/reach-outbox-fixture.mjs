#!/usr/bin/env node
/** Synthetic-only web/API fixtures for a real, loopback-only GoHyperLevel Docker service. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const phase=process.argv[2],base='http://127.0.0.1:4700';
const statePath='/data/reach-outbox-qa.json',crashPath='/data/reach-outbox-crash-qa.json';
const after=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const database=()=>new DatabaseSync('/data/pghl.db');
async function login(){
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'x-pghl':'1','content-type':'application/json'},
  body:JSON.stringify({email:'reach-outbox-admin@example.invalid',password:process.env.PGHL_ADMIN_PASSWORD}),
  signal:AbortSignal.timeout(8000)});
 assert.equal(r.status,200,'synthetic admin login');
 const cookie=r.headers.get('set-cookie')?.split(';')[0];assert(cookie);
 const me=await fetch(base+'/api/me',{headers:{cookie,'x-pghl':'1'},signal:AbortSignal.timeout(8000)});
 assert.equal(me.status,200);
 const locations=(await me.json()).locations;
 assert(locations.length>0);
 return {cookie,location:locations[0].id};
}
async function request(s,method,path,body){
 const r=await fetch(base+path,{method,
  headers:{cookie:s.cookie,'x-pghl':'1','x-location-id':s.location,
   ...(body!==undefined?{'content-type':'application/json'}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(9000)});
 const raw=await r.text();let obj;
 try{obj=JSON.parse(raw);}catch{obj=raw;}
 assert.equal(r.status,200,method+' '+path+' '+JSON.stringify(obj).slice(0,450));
 return obj;
}
const choices=[
 {key:'email_before_accept',channel:'send_email',
  step:{id:'reach-external-email',type:'send_email',subject:'REACH test',body:'Synthetic message for {{contact.first_name}}'}},
 {key:'sms_after_accept',channel:'send_sms',
  step:{id:'reach-external-sms',type:'send_sms',body:'REACH synthetic SMS only'}},
 {key:'email_key_only_replay',channel:'send_email',lookupUnavailable:true,
  step:{id:'reach-external-email-key-only',type:'send_email',subject:'REACH fake retry',body:'Same idempotency key on retry'}},
 {key:'webhook_after_accept',channel:'webhook',
  step:{id:'reach-external-webhook',type:'webhook',method:'POST',url:'https://fake.reach.invalid/hook'}},
 {key:'postiz_after_accept',channel:'social_post',
  step:{id:'reach-external-postiz',type:'social_post',mode:'now',integration_ids:['reach-fake-postiz-feed'],
   body:'REACH fake Postiz social post'}},
 {key:'webhook_unresolvable',channel:'webhook',unreliable:true,
  step:{id:'reach-external-webhook-unreliable',type:'webhook',url:'https://fake.reach.invalid/unsupported'}},
 {key:'postiz_unresolvable',channel:'social_post',unreliable:true,
  step:{id:'reach-external-postiz-unreliable',type:'social_post',mode:'now',
   integration_ids:['reach-fake-postiz-feed'],body:'REACH fake unresolved publication'}},
];
async function setup(){
 assert(!existsSync(statePath),'fresh volume required for test setup');
 const s=await login(),meta=await request(s,'GET','/api/workflows/meta');
 assert(meta.steps.includes('social_post'),'real upstream Postiz action must be registered');
 const manifest={location:s.location,cases:[]};
 const d=database();
 for(let n=0;n<choices.length;n++){
  const c=choices[n];
  const contact=await request(s,'POST','/api/contacts',{
   first_name:'REACH',last_name:'Synthetic '+c.key,
   email:'reach-'+c.key+'@example.invalid',
   phone:'+1555000'+String(1020+n),
  });
  const w=await request(s,'POST','/api/workflows',{
   name:'REACH fake external '+c.key,trigger:{type:'manual',config:{}},
   steps:[{id:'reach-internal-tag-'+n,type:'add_tag',tags:['reach-synthetic-queued']},c.step],
  });
  await request(s,'PATCH','/api/workflows/'+w.id,{status:'active'});
  const enrolled=await request(s,'POST','/api/workflows/'+w.id+'/enroll',{contact_ids:[contact.id]});
  assert.equal(enrolled.enrolled,1);
  const runs=await request(s,'GET','/api/workflows/'+w.id+'/runs');
  assert.equal(runs.runs.length,1);
  assert.equal(runs.runs[0].status,'completed','enqueuing must not send and should finish workflow');
  const entries=d.prepare('SELECT * FROM reach_synthetic_outbox WHERE run_id=?').all(runs.runs[0].id);
  assert.equal(entries.length,1,'only one durable external intent per action');
  assert.equal(entries[0].status,'pending');
  assert.equal(entries[0].channel,c.channel);
  const item={key:c.key,channel:c.channel,outboxId:entries[0].id,
   runId:runs.runs[0].id,contactId:contact.id,workflowId:w.id,unreliable:!!c.unreliable};
  if(c.unreliable||c.lookupUnavailable){
   const change=d.prepare('UPDATE reach_synthetic_outbox SET provider_supports_idempotency=?, provider_supports_lookup=0 WHERE id=?').run(c.unreliable?0:1,item.outboxId);
   assert.equal(change.changes,1);
  }
  manifest.cases.push(item);
 }
 // Negative safety gates: non-synthetic targets must NEVER create any outbound row.
 const unsafe=[
  {key:'real-domain-email',email:'forbidden@example.com',phone:'+15550001999',
   action:{type:'send_email',subject:'Reject',body:'Never sent'}},
  {key:'real-domain-webhook',email:'reject-webhook@example.invalid',phone:'+15550001999',
   action:{type:'webhook',url:'https://example.com/never-send'}},
  {key:'real-postiz-channel',email:'reject-postiz@example.invalid',phone:'+15550001999',
   action:{type:'social_post',integration_ids:['real-postiz-channel'],body:'Never publish'}},
  {key:'real-phone-sms',email:'reject-sms@example.invalid',phone:'+17770000000',
   action:{type:'send_sms',body:'Never send'}}
 ];
 for(const item of unsafe){
  const c=await request(s,'POST','/api/contacts',{
   first_name:'Reject',last_name:item.key,email:item.email,phone:item.phone
  });
  const w=await request(s,'POST','/api/workflows',{
   name:'REACH unsafe guard '+item.key,trigger:{type:'manual',config:{}},
   steps:[item.action],settings:{stop_on_error:true}
  });
  await request(s,'PATCH','/api/workflows/'+w.id,{status:'active'});
  await request(s,'POST','/api/workflows/'+w.id+'/enroll',{contact_ids:[c.id]});
  const runs=await request(s,'GET','/api/workflows/'+w.id+'/runs');
  assert.equal(runs.runs.length,1);
  assert.equal(runs.runs[0].status,'failed','unsafe channel input must fail closed');
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM reach_synthetic_outbox WHERE run_id=?').get(runs.runs[0].id).n,0,
   'unsafe input must not be queued');
 }
 d.close();
 writeFileSync(statePath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({phase:'setup',cases:manifest.cases.length,
  channels:manifest.cases.map(c=>c.channel),unsafeTargetsRejected:unsafe.length,
  fakeOnly:true,status:'pending'}));
}
async function armCrash(){
 const s=await login(),contact=await request(s,'POST','/api/contacts',{
  first_name:'REACH',last_name:'Outbox Crash',
  email:'reach-queued-process-crash@example.invalid',phone:'+15550009999',
 });
 const workflow=await request(s,'POST','/api/workflows',{
  name:'REACH app after-enqueue crash',trigger:{type:'manual',config:{}},
  steps:[{id:'reach-crash-initial',type:'add_tag',tags:['reach-queued-before-kill']},
   {id:'reach-outbox-crash-target',type:'send_email',
    subject:'REACH fake app crash',body:'Fake only - never send'}],
 });
 await request(s,'PATCH','/api/workflows/'+workflow.id,{status:'active'});
 writeFileSync(crashPath,JSON.stringify({contactId:contact.id,workflowId:workflow.id,
  location:s.location},null,2)+'\n',{mode:0o600});
 try{
  const r=await fetch(base+'/api/workflows/'+workflow.id+'/enroll',{
   method:'POST',headers:{cookie:s.cookie,'x-pghl':'1','x-location-id':s.location,'content-type':'application/json'},
   body:JSON.stringify({contact_ids:[contact.id]}),signal:AbortSignal.timeout(7000)});
  throw Error('Application did not terminate during enqueue: HTTP '+r.status);
 }catch(e){
  if(String(e).includes('Application did not terminate'))throw e;
 }
 console.log(JSON.stringify({phase:'arm-crash',requestInterrupted:true}));
}
function markStale(){
 assert(existsSync('/data/reach-fault-fired'),'application SIGKILL marker absent');
 const saved=JSON.parse(readFileSync(crashPath,'utf8'));
 const d=database();
 const runs=d.prepare('SELECT id,status,cursor FROM workflow_runs WHERE workflow_id=? AND contact_id=?').all(saved.workflowId,saved.contactId);
 assert.equal(runs.length,1);
 assert.equal(runs[0].status,'running');
 const out=d.prepare('SELECT id,status FROM reach_synthetic_outbox WHERE run_id=?').all(runs[0].id);
 assert.equal(out.length,1);
 assert.equal(out[0].status,'pending');
 d.prepare("UPDATE workflow_runs SET updated_at='2001-01-01T00:00:00.000Z' WHERE id=?").run(runs[0].id);
 d.close();
 saved.runId=runs[0].id;
 saved.outboxId=out[0].id;
 writeFileSync(crashPath,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({phase:'offline',pendingOutbox:1,
  staleRunningWorkflow:1,cursor:runs[0].cursor}));
}
async function verifyCrash(){
 const saved=JSON.parse(readFileSync(crashPath,'utf8'));
 const deadline=Date.now()+40000;
 let rows=[];
 while(Date.now()<deadline){
  const d=database();
  rows=d.prepare('SELECT status,cursor FROM workflow_runs WHERE id=?').all(saved.runId);
  const out=d.prepare('SELECT id FROM reach_synthetic_outbox WHERE run_id=?').all(saved.runId);
  d.close();
  assert.equal(out.length,1,'replay must not duplicate queued external intent');
  assert.equal(out[0].id,saved.outboxId);
  if(rows[0]?.status==='completed')break;
  await after(650);
 }
 assert.equal(rows[0]?.status,'completed','workflow resumes from saved cursor');
 const sess=await login();
 const c=await request(sess,'GET','/api/contacts/'+saved.contactId);
 assert(c.tags.includes('reach-queued-before-kill'));
 console.log(JSON.stringify({phase:'verified-after-app-crash',
  outboxId:saved.outboxId,queuedExactlyOnce:true,status:'completed'}));
}
if(phase==='setup')await setup();
else if(phase==='arm-crash')await armCrash();
else if(phase==='offline')markStale();
else if(phase==='verify-crash')await verifyCrash();
else throw Error('phase must be setup / arm-crash / offline / verify-crash');
