#!/usr/bin/env node
/**
 * REACH synthetic transactional outbox integration: fake external provider ledger
 * survives independent worker crashes; app survives after-enqueue SIGKILL.
 *
 * Not a real delivery adapter: server & workers are --network none, all
 * provider outcomes are simulated by separate SQLite on a second named volume.
 */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const upstream=resolve(process.argv[2]||'_upstream/gohyperlevel');
const fixture=readFileSync(resolve('audit/gohyperlevel/reach-outbox-fixture.mjs'),'utf8');
const worker=readFileSync(resolve('audit/gohyperlevel/reach-fake-provider-worker.mjs'),'utf8');
const name=randomBytes(5).toString('hex'),imageName='reach-synthetic-outbox:'+name;
const volume='reach-outbox-data-'+name,providerVolume='reach-outbox-provider-'+name;
const first='reach-outbox-first-'+name,crashing='reach-outbox-crashing-'+name,replacement='reach-outbox-restored-'+name;
const password=randomBytes(32).toString('base64url');
const folder=join(process.env.RUNNER_TEMP||'/tmp','reach-outbox-evidence');
mkdirSync(folder,{recursive:true});
const report={status:'INCOMPLETE',source:'GoHyperLevel@24ea786b85c3240ae4f24dcad6f657749730c56e',
 isolation:'Docker network=none, no real accounts or provider credentials',
 driver:'fake provider separate SQLite named volume',cases:[],appCrash:{},noExternalNetwork:true};
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function command(args,{input,timeout=120000,allowNonzero=false}={}){
 const r=spawnSync('docker',args,{encoding:'utf8',input,timeout,maxBuffer:9e6,
  env:{...process.env,PGHL_ADMIN_PASSWORD:password}});
 if(!allowNonzero&&(r.error||r.status!==0))
  throw Error('docker '+args.slice(0,5).join(' ')+' failed: '+String(r.error||r.stderr||r.stdout).slice(-1600));
 return r;
}
function output(args,options){return command(args,options).stdout.trim();}
function runApp(container,{fault=false}={}){
 const env=['NODE_ENV=production','PORT=4700','PGHL_HOST=127.0.0.1',
  'PGHL_BASE_URL=http://127.0.0.1:4700','PGHL_BEHIND_PROXY=0','PGHL_DATA_DIR=/data',
  'PGHL_DEMO_MODE=0','PGHL_CLOUD_MODE=0','PGHL_TICK_MS=500','PGHL_BACKUPS=0',
  'PGHL_ADMIN_EMAIL=reach-outbox-admin@example.invalid','PGHL_ADMIN_PASSWORD',
  'PGHL_ADMIN_NAME=REACH Outbox QA','PGHL_COMPANY_NAME=REACH Fake Client',
  'PGHL_TIMEZONE=UTC','REACH_SYNTHETIC_OUTBOX=yes',
  ...(fault?['REACH_FAULT_SYNTHETIC=yes','REACH_FAULT_STAGE=after_action',
   'REACH_FAULT_STEP_ID=reach-outbox-crash-target']:[])
 ];
 output(['create','--name',container,'--network','none','--security-opt','no-new-privileges',
  '--mount','type=volume,source='+volume+',target=/data',
  ...env.flatMap(e=>['--env',e]),imageName]);
 output(['start',container]);
}
async function healthy(container){
 const code="fetch('http://127.0.0.1:4700/healthz',{signal:AbortSignal.timeout(1300)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))";
 for(let i=0;i<75;i++){
  const r=command(['exec',container,'node','-e',code],{timeout:6000,allowNonzero:true});
  if(r.status===0)return;
  await sleep(750);
 }
 throw Error('Synthetic GoHyperLevel service failed healthz: '+output(['logs','--tail','25',container]));
}
function apiPhase(container,phase,{expectExit=false}={}){
 const r=command(['exec','-i','-e','PGHL_ADMIN_PASSWORD',container,
  'node','--no-warnings','--input-type=module','-',phase],
 {input:fixture,timeout:45000,allowNonzero:expectExit});
 if(!expectExit){
  const v=JSON.parse(r.stdout.trim().split('\n').at(-1));
  return v;
 }
 return {exitCode:r.status,stdout:r.stdout.slice(-300),stderr:r.stderr.slice(-300)};
}
function dataPhase(phase){
 const r=command(['run','--rm','-i','--network','none',
  '--mount','type=volume,source='+volume+',target=/data',
  '--entrypoint','node',imageName,'--no-warnings','--input-type=module','-',phase],
 {input:fixture,timeout:20000});
 return JSON.parse(r.stdout.trim().split('\n').at(-1));
}
function workerOnce(mode,entry,expectedStatus=0){
 const r=command(['run','--rm','-i','--network','none',
  '--mount','type=volume,source='+volume+',target=/data',
  '--mount','type=volume,source='+providerVolume+',target=/provider',
  '--env','REACH_SYNTHETIC_PROVIDER=yes','--entrypoint','node',
  imageName,'--no-warnings','--input-type=module','-',mode,entry],
 {input:worker,timeout:30000,allowNonzero:true});
 assert.equal(r.status,expectedStatus,'fake provider '+mode+' unexpected exit code: '+r.stderr.slice(-700));
 if(expectedStatus!==0)return {mode,expectedWorkerCrash:expectedStatus};
 const info=JSON.parse(r.stdout.trim().split('\n').at(-1));
 assert(info.status==='delivered'||info.status==='review_required','fake provider must resolve to safe state');
 return info;
}
function manifest(){
 const code="console.log(require('fs').readFileSync('/data/reach-outbox-qa.json','utf8'))";
 return JSON.parse(output(['exec',first,'node','-e',code]));
}
function manifestOffline(){
 const code="console.log(require('fs').readFileSync('/data/reach-outbox-crash-qa.json','utf8'))";
 const result=output(['run','--rm','--network','none',
  '--mount','type=volume,source='+volume+',target=/data',
  '--entrypoint','node',imageName,'-e',code]);
 return JSON.parse(result);
}
let built=false,volumeCreated=false,providerCreated=false;
try{
 console.log('Build pinned GoHyperLevel with staging-only outbox and QA crash hook...');
 output(['build','-t',imageName,upstream],{timeout:900000});built=true;
 output(['volume','create',volume]);volumeCreated=true;
 output(['volume','create',providerVolume]);providerCreated=true;
 runApp(first);await healthy(first);
 const started=apiPhase(first,'setup');
 assert.equal(started.cases,6);
 const m=manifest();
 assert.equal(m.cases.length,6);
 report.setup={outboxRows:started.cases,channels:started.channels,realDispatches:0};
 const cases=[
  {key:'email_before_accept',crash:'before_accept',expected:73,state:'delivered'},
  {key:'sms_after_accept',crash:'after_accept',expected:74,state:'delivered'},
  {key:'webhook_after_accept',crash:'after_accept',expected:74,state:'delivered'},
  {key:'postiz_after_accept',crash:'after_accept',expected:74,state:'delivered'},
  {key:'webhook_unresolvable',crash:'after_accept',expected:74,state:'review_required'},
  {key:'postiz_unresolvable',crash:'after_accept',expected:74,state:'review_required'},
 ];
 for(const item of cases){
  const selected=m.cases.find(x=>x.key===item.key);
  assert(selected,'fixture lacks '+item.key);
  workerOnce(item.crash,selected.outboxId,item.expected);
  const recovered=workerOnce('reconcile',selected.outboxId);
  assert.equal(recovered.status,item.state);
  assert.equal(recovered.ledger,1,'fake remote receipt must be exactly one');
  assert.equal(recovered.attempts,1,'no second unsafe attempt after ambiguous ACK');
  const repeated=workerOnce('reconcile',selected.outboxId);
  assert.equal(repeated.noRepeat,true,'finished state is stable');
  assert.equal(repeated.providerCount,1);
  report.cases.push({key:item.key,channel:selected.channel,workerCrash:item.crash,
   state:recovered.status,remoteReceipts:recovered.ledger,attempts:recovered.attempts,
   repeatedReconciliation:'no-send'});
  console.log(JSON.stringify({case:item.key,channel:selected.channel,
   afterCrash:recovered.status,fakeRemoteAcceptances:1,duplicates:0}));
 }
 assert.equal(report.cases.filter(x=>x.state==='review_required').length,2,'non-dedupable provider requires manual review');
 output(['rm','-f',first]); // remove service; keep both SQLite volumes

 // The second service is instrumented to SIGKILL after an email was
 // durably enqueued but before GoHyperLevel checkpoints its cursor.
 runApp(crashing,{fault:true});
 await healthy(crashing);
 const attempted=apiPhase(crashing,'arm-crash',{expectExit:true});
 let stopped=false;
 for(let tries=0;tries<45;tries++){
  const r=command(['inspect','--format','{{.State.Running}}',crashing],{allowNonzero:true});
  if(r.status===0&&r.stdout.trim()==='false'){stopped=true;break;}
  await sleep(240);
 }
 if(!stopped){
  const logs=output(['logs','--tail','30',crashing]);
  throw Error('Expected synthetic app fault did not terminate server: '+attempted.stderr.slice(-250)+' '+logs.slice(-650));
 }
 output(['rm','-f',crashing]);
 const offline=dataPhase('offline');
 assert.equal(offline.pendingOutbox,1);
 assert.equal(offline.staleRunningWorkflow,1);
 report.appCrash={realAppKilled:true,pendingOutboxBeforeRecovery:1,savedCursor:offline.cursor};
 runApp(replacement);await healthy(replacement);
 const resumed=apiPhase(replacement,'verify-crash');
 assert.equal(resumed.queuedExactlyOnce,true);
 assert.equal(resumed.status,'completed');
 const extra=manifestOffline();
 const delivered=workerOnce('dispatch',extra.outboxId);
 assert.equal(delivered.status,'delivered');
 assert.equal(delivered.ledger,1);
 const repeat=workerOnce('reconcile',extra.outboxId);
 assert.equal(repeat.noRepeat,true);
 output(['restart','--time','6',replacement],{timeout:30000});
 await healthy(replacement);
 const afterRestart=apiPhase(replacement,'verify-crash');
 assert.equal(afterRestart.queuedExactlyOnce,true);
 report.appCrash={...report.appCrash,workerDeliveredOnce:true,
  noDuplicateAfterSecondAppRestart:true};
 report.status='PASS';
 console.log(JSON.stringify({result:'PASS',fakeChannels:4,
  providerWorkerCrashCases:6,unknownOutcomesForHumanReview:2,
  fakeRemoteDuplicates:0,appKillRecovery:true,oneQueuedIntentAfterAppCrash:true,
  network:'none'},null,2));
}catch(e){
 report.status='FAIL';report.error=String(e?.message||e).slice(0,1700);
 console.error('REACH synthetic outbox integration failed:',report.error);
 process.exitCode=1;
}finally{
 writeFileSync(join(folder,'reach-outbox-synthetic-results.json'),JSON.stringify(report,null,2)+'\n');
 for(const c of [first,crashing,replacement])command(['rm','-f',c],{allowNonzero:true,timeout:25000});
 if(volumeCreated)command(['volume','rm',volume],{allowNonzero:true,timeout:25000});
 if(providerCreated)command(['volume','rm',providerVolume],{allowNonzero:true,timeout:25000});
 if(built)command(['image','rm','-f',imageName],{allowNonzero:true,timeout:25000});
}
