#!/usr/bin/env node
/** Synthetic backup/restore fixture: interacts with actual localhost GoHyperLevel API. */
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const mode=process.argv[2],base='http://127.0.0.1:4700';
const manifestFile='/data/reach-backup-source.json';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function session(){
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'x-pghl':'1','content-type':'application/json'},
  body:JSON.stringify({email:'reach-backup-admin@example.invalid',password:process.env.PGHL_ADMIN_PASSWORD}),
  signal:AbortSignal.timeout(8000)});
 assert.equal(r.status,200,'restore must preserve original administrator credentials');
 const cookie=r.headers.get('set-cookie')?.split(';')[0];assert(cookie);
 const me=await fetch(base+'/api/me',{headers:{cookie,'x-pghl':'1'},signal:AbortSignal.timeout(8000)});
 assert.equal(me.status,200);
 return {cookie,location:(await me.json()).locations[0].id};
}
async function api(s,method,path,body){
 const r=await fetch(base+path,{method,headers:{cookie:s.cookie,'x-pghl':'1','x-location-id':s.location,
  ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const raw=await r.text();let d;
 try{d=JSON.parse(raw);}catch{d=raw;}
 assert.equal(r.status,200,method+' '+path+': '+JSON.stringify(d).slice(0,350));return d;
}
function local(){return JSON.parse(readFileSync(manifestFile,'utf8'));}
async function seed(){
 const s=await session();
 const contact=await api(s,'POST','/api/contacts',{
  first_name:'Encrypted',last_name:'Backup Student',email:'reach-backup-synthetic@example.invalid'
 });
 const tag='reach-encrypted-backup-tag';
 const title='REACH task after restored backup';
 const w=await api(s,'POST','/api/workflows',{name:'REACH backup restore continuity',
  trigger:{type:'manual',config:{}},
  steps:[{id:'reach-before-backup',type:'add_tag',tags:[tag]},
   {id:'reach-wait-backup',type:'wait',amount:1,unit:'days'},
   {id:'reach-task-after-backup',type:'create_task',title}]});
 await api(s,'PATCH','/api/workflows/'+w.id,{status:'active'});
 const enroll=await api(s,'POST','/api/workflows/'+w.id+'/enroll',{contact_ids:[contact.id]});
 assert.equal(enroll.enrolled,1);
 const runs=await api(s,'GET','/api/workflows/'+w.id+'/runs');
 assert.equal(runs.runs[0].status,'waiting');
 const snapshot=await api(s,'POST','/api/admin/backups',{});
 assert(snapshot.name.startsWith('pghl-')&&snapshot.name.endsWith('.db'));
 const info={location:s.location,contactId:contact.id,workflowId:w.id,runId:runs.runs[0].id,
  tag,title,backupName:snapshot.name};
 writeFileSync(manifestFile,JSON.stringify(info,null,2)+'\n',{mode:0o600});
 assert(existsSync('/data/backups/'+snapshot.name),'consistent SQLite snapshot exists');
 console.log(JSON.stringify({stage:'seeded',source:'authenticated real backup endpoint',
  runState:'waiting',snapshot:snapshot.name}));
}
function due(){
 const d=new DatabaseSync('/data/pghl.db');
 const m=local();
 const record=d.prepare('SELECT status,cursor FROM workflow_runs WHERE id=?').get(m.runId);
 assert.equal(record.status,'waiting');
 assert.deepEqual(JSON.parse(record.cursor),[2]);
 assert.equal(d.prepare("UPDATE workflow_runs SET next_run_at='2001-01-01T00:00:00.000Z' WHERE id=?").run(m.runId).changes,1);
 d.close();
 console.log(JSON.stringify({stage:'restored-due',cursor:record.cursor,restoredDatabase:true}));
}
async function verify(){
 const m=local(),s=await session();
 assert.equal(s.location,m.location,'same tenant retained');
 const c=await api(s,'GET','/api/contacts/'+m.contactId);
 assert.equal(c.id,m.contactId);
 assert(c.tags.includes(m.tag));
 const deadline=Date.now()+40000;
 let status='';
 while(Date.now()<deadline){
  const r=await api(s,'GET','/api/workflows/'+m.workflowId+'/runs');
  status=r.runs[0].status;
  if(status==='completed')break;
  await pause(700);
 }
 assert.equal(status,'completed','restored workflow must finish after due');
 const d=new DatabaseSync('/data/pghl.db');
 assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const tasks=d.prepare('SELECT id FROM tasks WHERE contact_id=? AND title=?').all(m.contactId,m.title);
 assert.equal(tasks.length,1,'one task after restoration');
 const r=d.prepare('SELECT status FROM workflow_runs WHERE id=?').get(m.runId);
 assert.equal(r.status,'completed');
 d.close();
 console.log(JSON.stringify({stage:'verified',restoredContacts:1,workflowCompleted:1,
  taskCount:1,duplicates:0,sqlite:'integrity_ok',sameAdminAndTenant:true}));
}
if(mode==='seed')await seed();
else if(mode==='due')due();
else if(mode==='verify')await verify();
else throw Error('phase seed/due/verify');
