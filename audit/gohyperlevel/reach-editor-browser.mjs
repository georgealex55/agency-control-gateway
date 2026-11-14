#!/usr/bin/env node
/** Actual browser editing against a disposable, loopback-only GoHyperLevel runtime. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const upstream=resolve(process.argv[2]||'_upstream/gohyperlevel');
const entry=join(upstream,'dist-server/server/index.js');
assert(existsSync(entry),'Upstream must be built first');
const runnerTemp=process.env.RUNNER_TEMP||tmpdir();
const evidence=join(runnerTemp,'reach-editor-evidence');
mkdirSync(evidence,{recursive:true});
const driver=join(runnerTemp,'reach-browser','node_modules','playwright-core','index.mjs');
assert(existsSync(driver),'Playwright driver missing');
const { chromium }=await import(pathToFileURL(driver).href);
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert(chrome,'Chrome/Chromium binary unavailable');
const dataDir=mkdtempSync(join(tmpdir(),'reach-ui-qa-'));
const email='reach-browser-admin@example.invalid';
const password=randomBytes(32).toString('base64url');
let processHandle, browser;
const report={candidate:'24ea786b85c3240ae4f24dcad6f657749730c56e',
  scope:'local loopback + synthetic only',steps:[],images:[],pageErrors:[],warnings:[]};
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function freePort(){
 const s=createServer();
 await new Promise((done,fail)=>{s.once('error',fail);s.listen(0,'127.0.0.1',done);});
 const p=s.address().port;
 await new Promise(done=>s.close(done));
 return p;
}
async function stop(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const exited=new Promise(done=>child.once('exit',done));
 child.kill('SIGTERM');
 const killer=setTimeout(()=>child.kill('SIGKILL'),7000);
 try{await exited;}finally{clearTimeout(killer);}
}
try{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 processHandle=spawn(process.execPath,[entry],{
   cwd:upstream,
   stdio:['ignore','pipe','pipe'],
   env:{
     PATH:process.env.PATH||'',HOME:process.env.HOME||'',
     LANG:'C.UTF-8',TZ:'UTC',NODE_ENV:'production',
     PORT:String(port),PGHL_HOST:'127.0.0.1',
     PGHL_BASE_URL:base,PGHL_DATA_DIR:dataDir,PGHL_DEMO_MODE:'0',
     PGHL_CLOUD_MODE:'0',PGHL_BEHIND_PROXY:'0',PGHL_TICK_MS:'3600000',
     PGHL_ADMIN_EMAIL:email,PGHL_ADMIN_PASSWORD:password,
     PGHL_ADMIN_NAME:'REACH Browser Synthetic',
     PGHL_COMPANY_NAME:'REACH Browser QA',PGHL_TIMEZONE:'UTC'
   }
 });
 let log='';
 for(const stream of [processHandle.stdout,processHandle.stderr])stream.on('data',x=>log=(log+String(x)).slice(-1600));
 let healthy=false;
 for(let i=0;i<90;i++){
   if(processHandle.exitCode!==null||processHandle.signalCode!==null)
     throw Error('Isolated server exited: '+log);
   try{
     const r=await fetch(base+'/healthz',{signal:AbortSignal.timeout(1500)});
     if(r.ok){healthy=true;break;}
   }catch{}
   await delay(1000);
 }
 assert(healthy,'Isolated GoHyperLevel instance did not become healthy: '+log);
 report.steps.push('Real original Node server started on ephemeral localhost port');
 browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
 const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}});
 const session=await context.request.post(base+'/api/auth/login',{
   data:{email,password},headers:{'x-pghl':'1'}
 });
 assert.equal(session.status(),200,'Synthetic admin login');
 const me=await context.request.get(base+'/api/me');
 assert.equal(me.status(),200,'Synthetic admin profile');
 const loc=(await me.json()).locations[0].id;
 const headers={'x-location-id':loc,'x-pghl':'1'};
 const created=await context.request.post(base+'/api/funnels',{
   data:{name:'REACH visual editor QA',kind:'website',template:'blank'},headers
 });
 assert.equal(created.status(),200,'Synthetic funnel creation');
 const funnel=await created.json(),pageRecord=funnel.pages[0];
 const page=await context.newPage();
 page.on('pageerror',e=>report.pageErrors.push(String(e.message).slice(0,250)));
 await page.goto(base+'/app/funnels/'+funnel.id,{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('[data-tour="page-builder"]').waitFor({state:'attached',timeout:30000});
 const welcome=page.getByText('What do you want to do?',{exact:true});
 if(await welcome.isVisible().catch(()=>false)){
   await page.getByRole('button',{name:/^Later$/i}).first().click({timeout:5000});
   report.steps.push('Dismissed optional first-run overlay');
 }
 const hero=page.locator('[data-tour="site-tree"] .k-block .tn-label').first();
 await hero.click({timeout:10000});
 const heading=page.locator('[data-tour="site-inspector"] .insp-body input').first();
 await heading.waitFor({state:'visible',timeout:10000});
 const heroText='REACH browser-edited synthetic hero';
 await heading.fill(heroText);
 await page.frameLocator('[data-tour="page-preview"]').getByText(heroText).first().waitFor({timeout:15000});
 report.steps.push('Edited Hero heading through real inspector and checked unsaved live iframe preview');
 const palette=page.locator('[data-tour="site-palette"] button.pal').filter({hasText:/^Text$/i}).first();
 await palette.click({timeout:10000});
 const tree=page.locator('[data-tour="site-tree"] .k-block');
 assert((await tree.count())>=2,'Text palette action did not create a new block');
 await tree.last().locator('.tn-label').click();
 const body=page.locator('[data-tour="site-inspector"] .insp-body textarea').first();
 await body.waitFor({state:'visible',timeout:10000});
 const bodyText='REACH browser-added synthetic text';
 await body.fill(bodyText);
 await page.frameLocator('[data-tour="page-preview"]').getByText(bodyText).first().waitFor({timeout:15000});
 report.steps.push('Added a Text block through the palette and edited its content');
 const save=page.locator('[data-tour="page-save"]');
 await save.click({timeout:10000});
 const detail=await context.request.get(base+'/api/funnels/'+funnel.id,{headers});
 assert.equal(detail.status(),200,'Saved site readback');
 const saved=(await detail.json()).pages.find(x=>x.id===pageRecord.id);
 const serialized=JSON.stringify(saved.blocks);
 assert(serialized.includes(heroText),'Browser-edited hero was not saved');
 assert(serialized.includes(bodyText),'Browser-added block was not saved');
 report.steps.push('Saved in the real browser and verified both edits in SQLite through API');
 await page.screenshot({path:join(evidence,'reach-editor-desktop.png'),fullPage:true,timeout:15000});
 report.images.push('reach-editor-desktop.png');
 await page.locator('[data-tour="site-device"] button').last().click({timeout:8000});
 assert.equal(await page.locator('[data-tour="site-device"] button').last().getAttribute('aria-pressed'),'true');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(evidence,'reach-editor-mobile.png'),fullPage:true,timeout:15000});
 report.images.push('reach-editor-mobile.png');
 report.steps.push('Switched live preview to phone mode and captured desktop/mobile UI evidence');
 assert.equal(report.pageErrors.length,0,'Browser reported uncaught frontend errors');
 console.log(JSON.stringify({result:'PASS',steps:report.steps,images:report.images,pageErrors:report.pageErrors},null,2));
} finally{
 writeFileSync(join(evidence,'reach-editor-summary.json'),JSON.stringify(report,null,2)+'\n');
 if(browser)await browser.close();
 await stop(processHandle);
 rmSync(dataDir,{recursive:true,force:true});
}
