#!/usr/bin/env node
/** REACH isolated Docker fault matrix: true process SIGKILL at step boundaries. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
const upstream=resolve(process.argv[2]||'_upstream/gohyperlevel');
const source=readFileSync(resolve('audit/gohyperlevel/reach-fault-phase.mjs'),'utf8');
const id=randomBytes(4).toString('hex');
const imageName='reach-fault-stage:'+id;
const password=randomBytes(32).toString('base64url');
const resultDir=join(process.env.RUNNER_TEMP||'/tmp','reach-fault-evidence');
mkdirSync(resultDir,{recursive:true});
const cases=[
 {stage:'before_action',kind:'create_task'},
 {stage:'after_action',kind:'create_task'},
 {stage:'after_checkpoint',kind:'create_task'},
 {stage:'after_action',kind:'add_note'},
];
const report={status:'INCOMPLETE',isolation:'Docker network none, disposable volumes, synthetic data',
 baseCandidate:'GoHyperLevel@24ea786b',cases:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(args,{input,timeout=90000,ignore=false}={}){
 const r=spawnSync('docker',args,{encoding:'utf8',input,timeout,maxBuffer:5e6,
   env:{...process.env,PGHL_ADMIN_PASSWORD:password}});
 if(!ignore && (r.error||r.status!==0)){
  throw Error('docker '+args.slice(0,4).join(' ')+' error: '+String(r.error||r.stderr||r.stdout).slice(-1200));
 }
 return r;
}
function docker(args,options){return command(args,options).stdout.trim();}
async function healthy(container){
 const expression="fetch('http://127.0.0.1:4700/healthz',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))";
 for(let k=0;k<90;k++){
  const p=command(['exec',container,'node','-e',expression],{ignore:true,timeout:5500});
  if(p.status===0)return;
  await sleep(1000);
 }
 throw Error('health check failed: '+docker(['logs','--tail','25',container]));
}
function start(name,volume,stage='',kind=''){
 const env=[
  'PGHL_ADMIN_EMAIL=reach-fault-admin@example.invalid','PGHL_ADMIN_PASSWORD',
  'PGHL_ADMIN_NAME=REACH QA Admin','PGHL_COMPANY_NAME=REACH Fault Stage',
  'PGHL_TIMEZONE=UTC','PGHL_DATA_DIR=/data','NODE_ENV=production',
  'PGHL_BEHIND_PROXY=0','PGHL_DEMO_MODE=0','PGHL_CLOUD_MODE=0',
  'PGHL_HOST=127.0.0.1','PORT=4700','PGHL_BASE_URL=http://127.0.0.1:4700',
  'PGHL_TICK_MS=500','PGHL_BACKUPS=0',
  ...(stage?['REACH_FAULT_SYNTHETIC=yes','REACH_FAULT_STAGE='+stage,
    'REACH_FAULT_KIND='+kind,'REACH_FAULT_STEP_ID=reach-crash-target']:[])
 ];
 command(['create','--name',name,'--network','none',
  '--mount','type=volume,source='+volume+',target=/data',
  '--security-opt','no-new-privileges',
  ...env.flatMap(e=>['--env',e]),imageName]);
 command(['start',name]);
}
function phase(name,which){
 const r=command(['exec','-i','-e','PGHL_ADMIN_PASSWORD',name,
  'node','--no-warnings','--input-type=module','-',which],{input:source,timeout:45000});
 const line=r.stdout.trim().split('\n').at(-1);
 return JSON.parse(line);
}
function offline(volume){
 const r=command(['run','--rm','-i','--network','none',
  '--mount','type=volume,source='+volume+',target=/data',
  '--entrypoint','node',imageName,'--no-warnings','--input-type=module','-','offline'],
  {input:source});
 return JSON.parse(r.stdout.trim().split('\n').at(-1));
}
let built=false;
try {
 console.log('Building disposable, patched and fault-instrumented GoHyperLevel image...');
 command(['build','-t',imageName,upstream],{timeout:900000});
 built=true;
 for(let k=0;k<cases.length;k++){
  const c=cases[k],volume='reach-fault-'+id+'-'+k;
  const initial='reach-fault-initial-'+id+'-'+k,replacement='reach-fault-new-'+id+'-'+k;
  let created=false;
  try{
   command(['volume','create',volume]);created=true;
   start(initial,volume,c.stage,c.kind);
   await healthy(initial);
   // This command is expected to lose its application connection (SIGKILL).
   const attempt=command(['exec','-i','-e','PGHL_ADMIN_PASSWORD',initial,
     'node','--no-warnings','--input-type=module','-','arm'],{
     input:source,ignore:true,timeout:25000
   });
   let stopped=false;
   for(let s=0;s<45;s++){
    const r=command(['inspect','--format','{{.State.Running}}',initial],{ignore:true});
    if(r.status===0 && r.stdout.trim()==='false'){stopped=true;break;}
    await sleep(250);
   }
   assert(stopped,'fault hook did not terminate original application: '+String(attempt.stderr).slice(-350));
   command(['rm','-f',initial]);
   const before=offline(volume);
   assert.equal(before.phase,'offline');
   start(replacement,volume);
   await healthy(replacement);
   const first=phase(replacement,'verify');
   assert.equal(first.duplicates,0);
   command(['restart','--time','6',replacement],{timeout:30000});
   await healthy(replacement);
   const second=phase(replacement,'verify');
   assert.equal(second.duplicates,0);
   report.cases.push({stage:c.stage,kind:c.kind,result:'PASS',atCrash:before,
     recovered:first,postRestart:second});
   console.log(JSON.stringify({case:k+1,stage:c.stage,kind:c.kind,result:'PASS',sideEffects:1,duplicates:0}));
  }finally{
   for(const name of [initial,replacement])command(['rm','-f',name],{ignore:true,timeout:30000});
   if(created)command(['volume','rm',volume],{ignore:true,timeout:30000});
  }
 }
 report.status='PASS';
 console.log(JSON.stringify({result:'PASS',cases:report.cases.length,duplicates:0,
    realSIGKILL:true,dockerServiceReplacement:true},null,2));
}catch(err){
 report.status='FAIL';report.error=String(err?.message||err).slice(0,1400);
 console.error('REACH fault matrix failed:',report.error);
 process.exitCode=1;
}finally{
 writeFileSync(join(resultDir,'reach-fault-results.json'),JSON.stringify(report,null,2)+'\n');
 if(built)command(['image','rm','-f',imageName],{ignore:true,timeout:30000});
}
