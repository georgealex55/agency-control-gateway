#!/usr/bin/env node
/** Synthetic, loopback-only workflow crash scenario inside Docker named volume. */
import assert from 'node:assert/strict';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const phase=process.argv[2];
const stage=process.env.REACH_FAULT_STAGE||'';
const kind=process.env.REACH_FAULT_KIND||'create_task';
const stateFile='/data/reach-fault-state.json';
const marker='/data/reach-fault-fired';
const dbFile='/data/pghl.db';
const base='http://127.0.0.1:4700';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const db=()=>new DatabaseSync(dbFile);
const detail=()=>JSON.parse(readFileSync(stateFile,'utf8'));

async function session(){
 const r=await fetch(base+'/api/auth/login',{method:'POST',
   headers:{'content-type':'application/json','x-pghl':'1'},
   body:JSON.stringify({email:'reach-fault-admin@example.invalid',password:process.env.PGHL_ADMIN_PASSWORD}),
   signal:AbortSignal.timeout(8000)});
 assert.equal(r.status,200);
 const cookie=r.headers.get('set-cookie')?.split(';')[0];
 assert(cookie);
 const p=await fetch(base+'/api/me',{headers:{cookie,'x-pghl':'1'},signal:AbortSignal.timeout(8000)});
 assert.equal(p.status,200);
 return {cookie,location:(await p.json()).locations[0].id};
}
async function api(s,method,path,body){
 const r=await fetch(base+path,{method,
   headers:{cookie:s.cookie,'x-location-id':s.location,'x-pghl':'1',
     ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(6000)});
 const response=await r.json();
 assert.equal(r.status,200,method+' '+path+' '+JSON.stringify(response).slice(0,450));
 return response;
}
function inspect(){
 const s=detail(),d=db();
 const run=d.prepare('SELECT status,cursor,vars FROM workflow_runs WHERE id=?').get(s.runId);
 const receipts=d.prepare('SELECT * FROM reach_workflow_internal_receipts WHERE run_id=?').all(s.runId);
 const tasks=d.prepare('SELECT id,title FROM tasks WHERE location_id=? AND contact_id=? AND title=?').all(s.location,s.contactId,s.title);
 const notes=d.prepare('SELECT id,body FROM notes WHERE location_id=? AND contact_id=? AND body=?').all(s.location,s.contactId,s.title);
 const contact=d.prepare('SELECT tags FROM contacts WHERE id=?').get(s.contactId);
 d.close();
 return {s,run,receiptCount:receipts.length,taskCount:tasks.length,noteCount:notes.length,
   tags:JSON.parse(contact.tags)};
}
async function arm(){
 assert(!existsSync(marker),'unique volume starts without prior failure marker');
 const s=await session();
 const contact=await api(s,'POST','/api/contacts',{
   first_name:'REACH',last_name:'Fault QA',email:'reach-fault-'+stage+'-'+kind+'@example.invalid'
 });
 const title='REACH recovery '+stage+' '+kind;
 const first={id:'reach-setup-tag',type:'add_tag',tags:['reach-fault-initial-tag']};
 const action=kind==='add_note'
   ?{id:'reach-crash-target',type:'add_note',body:title}
   :{id:'reach-crash-target',type:'create_task',title};
 const workflow=await api(s,'POST','/api/workflows',{
   name:'REACH fault '+stage+' '+kind,trigger:{type:'manual',config:{}},steps:[first,action]
 });
 await api(s,'PATCH','/api/workflows/'+workflow.id,{status:'active'});
 writeFileSync(stateFile,JSON.stringify({
   stage,kind,location:s.location,contactId:contact.id,workflowId:workflow.id,title
 },null,2)+'\n',{mode:0o600});
 // Expected: app is SIGKILLed while handling this HTTP request.
 try{
   const r=await fetch(base+'/api/workflows/'+workflow.id+'/enroll',{method:'POST',
     headers:{cookie:s.cookie,'x-location-id':s.location,'x-pghl':'1','content-type':'application/json'},
     body:JSON.stringify({contact_ids:[contact.id]}),signal:AbortSignal.timeout(4000)});
   const body=await r.text();
   const workflowRuns=await api(s,'GET','/api/workflows/'+workflow.id+'/runs');
   const saved=await api(s,'GET','/api/workflows/'+workflow.id);
   const summary=workflowRuns.runs.map(x=>({status:x.status,cursor:x.cursor,log:x.log.map(l=>({step:l.step,type:l.type,skipped:l.skipped,result:l.result,error:l.error}))}));
   throw Error('Fault injection did not interrupt service, HTTP '+r.status+' response='+body.slice(0,150)+' runSummary='+JSON.stringify(summary).slice(0,850)+' savedSteps='+JSON.stringify(saved.steps).slice(0,300)+' stage='+process.env.REACH_FAULT_STAGE+' step='+process.env.REACH_FAULT_STEP_ID+' armed='+process.env.REACH_FAULT_SYNTHETIC);
 }catch(e){
   if(String(e).includes('Fault injection did not'))throw e;
 }
 console.log(JSON.stringify({phase:'arm',stage,kind,expectedShutdown:true}));
}
function offline(){
 assert(existsSync(marker),'real process must write marker BEFORE SIGKILL');
 const markerInfo=JSON.parse(readFileSync(marker,'utf8'));
 const s=detail();
 assert.equal(markerInfo.stage,s.stage,'selected fault point');
 const d=db();
 const runs=d.prepare('SELECT id,status,cursor,vars FROM workflow_runs WHERE workflow_id=? AND contact_id=?').all(s.workflowId,s.contactId);
 assert.equal(runs.length,1,'one run');
 const run=runs[0];
 assert.equal(run.status,'running','hard crash left claimed run');
 s.runId=run.id;
 const received=d.prepare('SELECT COUNT(*) n FROM reach_workflow_internal_receipts WHERE run_id=?').get(run.id).n;
 const tasks=d.prepare('SELECT COUNT(*) n FROM tasks WHERE contact_id=? AND title=?').get(s.contactId,s.title).n;
 const notes=d.prepare('SELECT COUNT(*) n FROM notes WHERE contact_id=? AND body=?').get(s.contactId,s.title).n;
 const expected=s.stage==='after_action'?1:0;
 assert.equal(received,expected,'atomic receipt state at crash boundary');
 assert.equal(s.kind==='add_note'?notes:tasks,expected,'internal side effect at crash boundary');
 assert.deepEqual(JSON.parse(run.cursor),s.stage==='after_checkpoint'?[1]:[1],'durable cursor from prior tag');
 d.prepare("UPDATE workflow_runs SET updated_at='2001-01-01T00:00:00.000Z' WHERE id=?").run(run.id);
 d.close();
 writeFileSync(stateFile,JSON.stringify(s,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({phase:'offline',stage:s.stage,kind:s.kind,receiptCount:received,
   actionCount:expected,staleCheckpoint:true}));
}
async function verify(){
 const deadline=Date.now()+35000;
 let got;
 while(Date.now()<deadline){
   got=inspect();
   if(got.run?.status==='completed')break;
   await pause(750);
 }
 assert.equal(got?.run?.status,'completed','recovered real scheduler must complete run');
 assert.deepEqual(JSON.parse(got.run.cursor),[],'run cursor at end');
 assert(got.tags.includes('reach-fault-initial-tag'),'precrash tag retained');
 assert.equal(got.receiptCount,1,'one committed receipt despite replay');
 assert.equal(got.s.kind==='add_note'?got.noteCount:got.taskCount,1,'exactly one internal side effect');
 const s=await session();
 const apiRuns=await api(s,'GET','/api/workflows/'+got.s.workflowId+'/runs');
 assert.equal(apiRuns.runs.length,1,'no duplicate enrollments');
 assert.equal(apiRuns.runs[0].status,'completed');
 console.log(JSON.stringify({phase:'verified',stage:got.s.stage,kind:got.s.kind,
   tasks:got.taskCount,notes:got.noteCount,receipts:got.receiptCount,duplicates:0}));
}
if(phase==='arm')await arm();
else if(phase==='offline')offline();
else if(phase==='verify')await verify();
else throw Error('Invalid phase');
