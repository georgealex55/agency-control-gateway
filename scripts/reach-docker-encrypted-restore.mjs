#!/usr/bin/env node
/** REACH synthetic encrypted backup/restore on TWO distinct Docker named volumes. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

const upstream=resolve(process.argv[2]||'_upstream/gohyperlevel');
const fixture=readFileSync(resolve('audit/gohyperlevel/reach-backup-restore-phase.mjs'),'utf8');
const crypt=readFileSync(resolve('audit/gohyperlevel/reach-encrypted-backup.mjs'),'utf8');
const suffix=randomBytes(5).toString('hex');
const imageName='reach-backup-stage:'+suffix;
const sourceVolume='reach-backup-source-'+suffix;
const restoreVolume='reach-backup-restored-'+suffix;
const original='reach-backup-original-'+suffix;
const restored='reach-backup-restored-service-'+suffix;
const password=randomBytes(32).toString('base64url');
const backupPassphrase=randomBytes(40).toString('base64url');
const evidenceDir=join(process.env.RUNNER_TEMP||'/tmp','reach-backup-evidence');
mkdirSync(evidenceDir,{recursive:true});
const report={status:'INCOMPLETE',method:'AES-256-GCM/scrypt',archive:'not uploaded',persist:'two distinct named Docker volumes',
 stages:[],syntheticOnly:true,network:'none'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(args,{input,timeout=120000,ignore=false}={}){
 const result=spawnSync('docker',args,{encoding:'utf8',input,timeout,maxBuffer:9e6,
  env:{...process.env,PGHL_ADMIN_PASSWORD:password,REACH_BACKUP_PASSPHRASE:backupPassphrase}});
 if(!ignore && (result.error||result.status!==0))
   throw Error('docker '+args.slice(0,4).join(' ')+': '+String(result.error||result.stderr||result.stdout).slice(-1650));
 return result;
}
function output(args,options){return command(args,options).stdout.trim();}
function start(container,volume){
 const env=[
  'PGHL_ADMIN_EMAIL=reach-backup-admin@example.invalid',
  'PGHL_ADMIN_PASSWORD','PGHL_DATA_DIR=/data','PGHL_HOST=127.0.0.1',
  'PGHL_BASE_URL=http://127.0.0.1:4700','PORT=4700','PGHL_BEHIND_PROXY=0',
  'PGHL_DEMO_MODE=0','PGHL_CLOUD_MODE=0','PGHL_TICK_MS=500','PGHL_BACKUPS=0',
  'PGHL_ADMIN_NAME=REACH backup QA','PGHL_COMPANY_NAME=REACH synthetic backup',
  'PGHL_TIMEZONE=UTC','NODE_ENV=production'
 ];
 output(['create','--name',container,'--network','none','--security-opt','no-new-privileges',
  '--mount','type=volume,source='+volume+',target=/data',
  ...env.flatMap(e=>['--env',e]),imageName]);
 output(['start',container]);
}
async function healthy(container){
 const code="fetch('http://127.0.0.1:4700/healthz',{signal:AbortSignal.timeout(1800)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))";
 for(let k=0;k<90;k++){
  const r=command(['exec',container,'node','-e',code],{timeout:5500,ignore:true});
  if(r.status===0)return;
  await wait(800);
 }
 throw Error('GoHyperLevel restored app health check timed out');
}
function phase(container,p){
 const raw=output(['exec','-i','-e','PGHL_ADMIN_PASSWORD',container,
  'node','--no-warnings','--input-type=module','-',p],{input:fixture,timeout:90000});
 return JSON.parse(raw.split('\n').at(-1));
}
function sidecar(script,p,src=sourceVolume,dst=restoreVolume){
 const result=output(['run','--rm','-i','--network','none',
  '--mount','type=volume,source='+src+',target=/source',
  '--mount','type=volume,source='+dst+',target=/restore',
  '--env','REACH_BACKUP_PASSPHRASE','--entrypoint','node',
  imageName,'--no-warnings','--input-type=module','-',p,'/source','/restore'],
  {input:script,timeout:60000});
 return JSON.parse(result.split('\n').at(-1));
}
function due(volume){
 const raw=output(['run','--rm','-i','--network','none',
  '--mount','type=volume,source='+volume+',target=/data',
  '--entrypoint','node',imageName,'--no-warnings','--input-type=module','-','due'],
  {input:fixture,timeout:30000});
 return JSON.parse(raw.split('\n').at(-1));
}
let built=false,sourceMade=false,restoreMade=false;
try {
 console.log('Build authentic patched GoHyperLevel Docker image for isolated backup...');
 output(['build','-t',imageName,upstream],{timeout:900000});built=true;
 output(['volume','create',sourceVolume]);sourceMade=true;
 output(['volume','create',restoreVolume]);restoreMade=true;
 start(original,sourceVolume);
 await healthy(original);
 const seeded=phase(original,'seed');
 assert.equal(seeded.stage,'seeded');
 report.stages.push(seeded);
 // The live application performed a consistent WAL-safe VACUUM INTO backup.
 const encrypted=sidecar(crypt,'encrypt');
 assert.equal(encrypted.stage,'encrypted');
 assert.equal(encrypted.snapshotDeleted,true);
 report.stages.push(encrypted);
 output(['kill','--signal','SIGKILL',original]);
 output(['rm','-f',original]);
 report.stages.push({stage:'source-stopped',method:'SIGKILL',originalDataVolumeIntact:true});
 // The encrypted archive is authenticated and restored to a DIFFERENT empty volume.
 const decoded=sidecar(crypt,'restore');
 assert.equal(decoded.stage,'restored');
 assert.equal(decoded.wrongPassword,'rejected');
 assert.equal(decoded.tamper,'rejected');
 assert.equal(decoded.integrity,'ok');
 report.stages.push(decoded);
 const readyToResume=due(restoreVolume);
 assert.equal(readyToResume.stage,'restored-due');
 report.stages.push(readyToResume);
 start(restored,restoreVolume);
 await healthy(restored);
 const checked=phase(restored,'verify');
 assert.equal(checked.stage,'verified');
 assert.equal(checked.taskCount,1);
 report.stages.push(checked);
 output(['restart','--time','7',restored],{timeout:40000});
 await healthy(restored);
 const checkedAgain=phase(restored,'verify');
 assert.equal(checkedAgain.taskCount,1);
 assert.equal(checkedAgain.duplicates,0);
 report.stages.push({...checkedAgain,afterSecondServiceRestart:true});
 report.status='PASS';
 console.log(JSON.stringify({result:'PASS',wrongPassphrase:'REJECTED',tamper:'REJECTED',
  sqliteIntegrity:'ok',freshVolumeRestore:true,workflowResumed:true,duplicates:0},null,2));
}catch(e){
 report.status='FAIL';report.error=String(e?.message||e).slice(0,1750);
 console.error('REACH encrypted backup/restore failed:',report.error);
 process.exitCode=1;
}finally{
 writeFileSync(join(evidenceDir,'reach-backup-restore-evidence.json'),JSON.stringify(report,null,2)+'\n');
 for(const c of [original,restored])command(['rm','-f',c],{ignore:true,timeout:30000});
 if(sourceMade)command(['volume','rm',sourceVolume],{ignore:true,timeout:30000});
 if(restoreMade)command(['volume','rm',restoreVolume],{ignore:true,timeout:30000});
 if(built)command(['image','rm','-f',imageName],{ignore:true,timeout:30000});
}
