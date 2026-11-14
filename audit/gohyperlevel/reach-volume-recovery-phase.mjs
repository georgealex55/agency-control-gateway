#!/usr/bin/env node
/**
 * REACH QA: run INSIDE offline, synthetic Docker container with /data named volume.
 * Stages: prepare (live service), offline (no service process), verify (live service).
 * No external HTTP, accounts, transports, credentials or social integrations.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const phase = process.argv[2];
const statePath='/data/reach-volume-qa-state.json';
const dbPath='/data/pghl.db';
const base='http://127.0.0.1:4700';
const sleep=(ms)=>new Promise(done=>setTimeout(done,ms));
const token=process.env.PGHL_ADMIN_PASSWORD;
const mail='reach-volume-admin@example.invalid';

function database(){return new DatabaseSync(dbPath);}
async function authorized(){
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'x-pghl':'1','content-type':'application/json'},body:JSON.stringify({email:mail,password:token}),signal:AbortSignal.timeout(8000)});
  assert.equal(login.status,200,'synthetic admin authentication persisted on mounted volume');
  const cookie=login.headers.get('set-cookie')?.split(';')[0]??'';
  assert(cookie,'synthetic admin session cookie');
  const read=await fetch(base+'/api/me',{headers:{cookie,'x-pghl':'1'},signal:AbortSignal.timeout(8000)});
  assert.equal(read.status,200,'synthetic /api/me');
  const me=await read.json();
  assert(me.locations.length>0,'persistent first client location');
  return {cookie,location:me.locations[0].id};
}
async function api(session,method,path,body=undefined){
  const r=await fetch(base+path,{
    method,headers:{'x-pghl':'1','x-location-id':session.location,cookie:session.cookie,
      ...(body!==undefined?{'content-type':'application/json'}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(10000)
  });
  const raw=await r.text();
  let json;
  try{json=JSON.parse(raw);}catch{json=raw;}
  assert.equal(r.status,200,method+' '+path+' '+JSON.stringify(json).slice(0,350));
  return json;
}
function runRow(db,id){
  return db.prepare('SELECT id, workflow_id, contact_id, status, cursor, next_run_at, updated_at, log FROM workflow_runs WHERE id=?').get(id);
}
async function prepare(){
  assert(existsSync(dbPath) && statSync(dbPath).size>0,'SQLite database must be on mounted volume');
  const sess=await authorized();
  const flows=[];
  for (const variant of ['wait-after-hard-kill','checkpoint-after-hard-kill']){
    const contact=await api(sess,'POST','/api/contacts',{
      first_name:'REACH',last_name:variant,email:variant+'@example.invalid'
    });
    const title='REACH volume recovery '+variant;
    const tag='reach-volume-persisted-'+variant;
    const workflow=await api(sess,'POST','/api/workflows',{
      name:'REACH volume '+variant,
      trigger:{type:'manual',config:{}},
      steps:[
        {id:'tag-step-'+variant,type:'add_tag',tags:[tag]},
        {id:'wait-step-'+variant,type:'wait',amount:1,unit:'days'},
        {id:'task-step-'+variant,type:'create_task',title}
      ]
    });
    await api(sess,'PATCH','/api/workflows/'+workflow.id,{status:'active'});
    const enroll=await api(sess,'POST','/api/workflows/'+workflow.id+'/enroll',{contact_ids:[contact.id]});
    assert.equal(enroll.enrolled,1,'synthetic workflow enrollment');
    const data=await api(sess,'GET','/api/workflows/'+workflow.id+'/runs');
    assert.equal(data.runs.length,1,'single workflow run');
    assert.equal(data.runs[0].status,'waiting','must have completed tag and be waiting before service kill');
    const db=database();
    const persisted=runRow(db,data.runs[0].id);
    assert.equal(persisted.status,'waiting');
    assert.deepEqual(JSON.parse(persisted.cursor),[2],'cursor persisted AFTER the wait step');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks WHERE location_id=? AND title=?').get(sess.location,title).n,0,'task not yet created');
    const tags=JSON.parse(db.prepare('SELECT tags FROM contacts WHERE id=?').get(contact.id).tags);
    assert(tags.includes(tag),'initial tag saved before shutdown');
    db.close();
    flows.push({variant,title,tag,contactId:contact.id,workflowId:workflow.id,runId:data.runs[0].id});
  }
  writeFileSync(statePath,JSON.stringify({location:sess.location,flows,phase:'prepared'},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({phase:'prepared',dbBytes:statSync(dbPath).size,waitRuns:flows.length,cursors:'[2]',tasksBeforeShutdown:0}));
}
function offline(){
  assert(existsSync(statePath),'metadata survived service termination');
  const state=JSON.parse(readFileSync(statePath,'utf8'));
  assert.equal(state.phase,'prepared','service did not finish prep');
  const db=database();
  const [waiting,crashed]=state.flows;
  assert.equal(runRow(db,waiting.runId).status,'waiting');
  assert.equal(runRow(db,crashed.runId).status,'waiting');
  // Move to due while the real service is dead. This simulates a delayed wait
  // becoming due during downtime without needing to sleep for a day.
  const updateDue=db.prepare("UPDATE workflow_runs SET next_run_at=? WHERE id=? AND status='waiting'");
  assert.equal(updateDue.run('2001-01-01T00:00:00.000Z',waiting.runId).changes,1);
  // Recreate the state after an unclean shutdown in the middle of an action,
  // with the original cursor already checkpointed after two internal steps.
  const updateStale=db.prepare("UPDATE workflow_runs SET status='running', next_run_at=NULL, updated_at=? WHERE id=? AND status='waiting'");
  assert.equal(updateStale.run('2001-01-01T00:00:00.000Z',crashed.runId).changes,1);
  assert.deepEqual(JSON.parse(runRow(db,crashed.runId).cursor),[2]);
  db.close();
  state.phase='offline-recovery-seeded';
  writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({phase:'offline-recovery-seeded',dueWait:1,staleRunningCheckpoint:1,service:'not-running'}));
}
async function verify(){
  const state=JSON.parse(readFileSync(statePath,'utf8'));
  assert(['offline-recovery-seeded','verified-after-restart'].includes(state.phase),'persisted recovery metadata unavailable');
  const session=await authorized();
  assert.equal(session.location,state.location,'first client ID unchanged across service recreation');
  const until=Date.now()+45000;
  let statuses=[];
  while(Date.now()<until){
    const db=database();
    statuses=state.flows.map(f=>runRow(db,f.runId)?.status);
    db.close();
    if(statuses.every(s=>s==='completed'))break;
    await sleep(650);
  }
  assert.deepEqual(statuses,['completed','completed'],'both recovered workflow runs reached completion after Docker service recreation');
  const db=database();
  let count=0;
  for(const f of state.flows){
    const row=runRow(db,f.runId);
    assert.equal(row.status,'completed');
    const tasks=db.prepare('SELECT * FROM tasks WHERE location_id=? AND contact_id=? AND title=?').all(state.location,f.contactId,f.title);
    assert.equal(tasks.length,1,'exactly one remaining task for '+f.variant);
    const dbContact=db.prepare('SELECT tags FROM contacts WHERE id=? AND location_id=?').get(f.contactId,state.location);
    assert(JSON.parse(dbContact.tags).includes(f.tag),'prior step tag survived both restarts');
    const viaHttp=await api(session,'GET','/api/contacts/'+f.contactId);
    assert.equal(viaHttp.id,f.contactId,'HTTP persistence readback');
    const runs=await api(session,'GET','/api/workflows/'+f.workflowId+'/runs');
    assert.equal(runs.runs.length,1,'no duplicate enrollment after restart');
    assert.equal(runs.runs[0].status,'completed');
    count+=tasks.length;
  }
  db.close();
  assert.equal(count,2);
  state.phase='verified-after-restart';
  writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({phase:'verified-after-restart',runStatuses:statuses,tasks:count,duplicates:0,syntheticAccountsOnly:true}));
}

if(phase==='prepare')await prepare();
else if(phase==='offline')offline();
else if(phase==='verify')await verify();
else throw Error('phase must be prepare/offline/verify');
