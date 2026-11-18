#!/usr/bin/env node
/**
 * REACH CI orchestrator: actual upstream Docker service, isolated named
 * persistence volume, SIGKILL + container destruction and recreation.
 *
 * A Docker named volume survives service deletion/replacement within this
 * isolated runner. The volume and image are removed after the verification.
 * No external staging account, real customer record or public port is used.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sourceDir=resolve(process.argv[2]||'_upstream/gohyperlevel');
const phaseSource=readFileSync(resolve('audit/gohyperlevel/reach-volume-recovery-phase.mjs'),'utf8');
assert(existsSync(join(sourceDir,'Dockerfile')),'Pinned GoHyperLevel Dockerfile missing');
const suffix=randomBytes(5).toString('hex');
const imageName='reach-volume-qa:'+suffix,volumeName='reach-volume-qa-'+suffix;
const service1='reach-app-initial-'+suffix,service2='reach-app-replaced-'+suffix;
const password=randomBytes(32).toString('base64url');
const outputDir=join(process.env.RUNNER_TEMP||'/tmp','reach-volume-recovery-evidence');
mkdirSync(outputDir,{recursive:true});
const report={
  source:'BAISESYSTEMS/GoHyperLevel@24ea786b85c3240ae4f24dcad6f657749730c56e',
  isolation:'Docker network=none; no public ports; synthetic accounts',
  storage:'unique Docker named volume mounted at /data; kept while application containers are deleted',
  events:[],
  status:'INCOMPLETE'
};
const sleep=(ms)=>new Promise(done=>setTimeout(done,ms));
function docker(args,{input,timeout=120000,quiet=false}={}){
  const r=spawnSync('docker',args,{
    encoding:'utf8',input,timeout,maxBuffer:8*1024*1024,
    env:{...process.env,PGHL_ADMIN_PASSWORD:password}
  });
  if(r.error)throw r.error;
  if(r.status!==0)throw Error('docker '+args.slice(0,3).join(' ')+': '+String(r.stderr||r.stdout).slice(-1900));
  const result=(r.stdout||'').trim();
  if(!quiet&&result)console.log(result.slice(-1400));
  return result;
}
function phaseInRunningContainer(container,phase){
  const result=docker(['exec','-i','-e','PGHL_ADMIN_PASSWORD',container,
    'node','--no-warnings','--input-type=module','-',phase],{input:phaseSource});
  const last=result.split('\n').at(-1);
  const parsed=JSON.parse(last);
  assert.equal(parsed.phase,phase==='prepare'?'prepared':'verified-after-restart');
  report.events.push(parsed);
  return parsed;
}
function volumeOfflineUpdate(){
  // Neither old nor new app service exists at this point.
  const out=docker(['run','--rm','-i','--network','none',
    '--mount','type=volume,source='+volumeName+',target=/data',
    '--entrypoint','node',imageName,'--no-warnings','--input-type=module','-','offline'],{input:phaseSource});
  const state=JSON.parse(out.split('\n').at(-1));
  assert.equal(state.phase,'offline-recovery-seeded');
  report.events.push(state);
}
function setupContainer(name){
  const env=[
    'PORT=4700','PGHL_HOST=127.0.0.1','PGHL_BASE_URL=http://127.0.0.1:4700',
    'PGHL_DATA_DIR=/data','PGHL_BEHIND_PROXY=0',
    'PGHL_CLOUD_MODE=0','PGHL_DEMO_MODE=0','PGHL_TICK_MS=650',
    'PGHL_ADMIN_EMAIL=reach-volume-admin@example.invalid',
    'PGHL_ADMIN_PASSWORD','PGHL_ADMIN_NAME=REACH QA Synthetic Admin',
    'PGHL_COMPANY_NAME=REACH Synthetic Staging',
    'PGHL_TIMEZONE=UTC','NODE_ENV=production'
  ];
  const args=['create','--name',name,'--network','none','--hostname','reach-qa',
    '--mount','type=volume,source='+volumeName+',target=/data',
    '--security-opt','no-new-privileges',
    ...env.flatMap(e=>['--env',e]),
    imageName];
  docker(args,{quiet:true});
  docker(['start',name],{quiet:true});
}
async function ready(container){
  const probe="fetch('http://127.0.0.1:4700/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>r.text().then(t=>{if(!r.ok||t.trim()!=='ok')process.exit(3)})).catch(()=>process.exit(2))";
  for(let i=0;i<90;i++){
    try { docker(['exec',container,'node','-e',probe],{timeout:6000,quiet:true});return; }
    catch { await sleep(1000); }
  }
  throw Error('GoHyperLevel app did not become healthy: '+docker(['logs','--tail','35',container],{quiet:true}));
}
let volumeCreated=false,imageBuilt=false;
try {
  console.log('Building pinned upstream container with isolated REACH field-access patch...');
  docker(['build','--tag',imageName,sourceDir],{timeout:900000,quiet:true});
  imageBuilt=true;
  docker(['volume','create',volumeName],{quiet:true});
  volumeCreated=true;
  setupContainer(service1);
  await ready(service1);
  report.events.push({kind:'service-start',name:'initial',network:'none'});
  phaseInRunningContainer(service1,'prepare');

  // Real ungraceful server termination: SIGKILL destroys the application.
  docker(['kill','--signal','SIGKILL',service1],{quiet:true});
  docker(['rm','-f',service1],{quiet:true});
  report.events.push({kind:'service-killed',signal:'SIGKILL',containerRemoved:true});
  assert(docker(['volume','inspect','--format','{{.Name}}',volumeName],{quiet:true})===volumeName,
    'named volume must persist after container removal');

  volumeOfflineUpdate();

  // Start fresh container with the SAME previously mounted SQLite volume.
  setupContainer(service2);
  await ready(service2);
  report.events.push({kind:'service-recreated',name:'replacement',sameNamedVolume:true});
  phaseInRunningContainer(service2,'verify');

  // A second real restart tests durable completion and no duplicate side effects.
  docker(['restart','--time','7',service2],{timeout:30000,quiet:true});
  await ready(service2);
  report.events.push({kind:'service-gracefully-restarted',sameNamedVolume:true});
  const after=phaseInRunningContainer(service2,'verify');
  assert.equal(after.duplicates,0);
  assert.equal(after.tasks,2);
  report.status='PASS';
  console.log(JSON.stringify({result:report.status,flowStatuses:after.runStatuses,
    syntheticTasks:after.tasks,duplicates:after.duplicates,serviceReplacements:2,
    network:'none',volumeReuse:true},null,2));
} catch(error){
  report.status='FAIL';
  report.error=String(error?.message||error).slice(0,1800);
  console.error('REACH persistent-volume recovery gate failed:',report.error);
  process.exitCode=1;
} finally {
  writeFileSync(join(outputDir,'reach-volume-recovery-summary.json'),
    JSON.stringify(report,null,2)+'\n');
  for(const c of [service1,service2]){
    try{docker(['rm','-f',c],{timeout:30000,quiet:true});}catch{}
  }
  if(volumeCreated)try{docker(['volume','rm',volumeName],{timeout:30000,quiet:true});}catch{}
  if(imageBuilt)try{docker(['image','rm','-f',imageName],{timeout:30000,quiet:true});}catch{}
}
