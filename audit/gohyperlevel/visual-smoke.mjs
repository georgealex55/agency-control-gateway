/** Ephemeral, synthetic-data runtime and browser audit. Never uses real customer accounts. */
import {writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

const base="http://127.0.0.1:4700";
const dir=join(process.env.RUNNER_TEMP||"/tmp","goh-evidence");
mkdirSync(dir,{recursive:true});
const playPath=join(process.env.RUNNER_TEMP||"/tmp","goh-visual","node_modules","playwright-core","index.mjs");
if(!existsSync(playPath))throw new Error("Isolated Playwright driver missing");
const {chromium}=await import(pathToFileURL(playPath).href);
const chromePaths=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"];
const chrome=chromePaths.find(p=>existsSync(p));
if(!chrome)throw new Error("Chrome/Chromium binary not installed on audit runner");
const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--no-sandbox"]});
const report={upstream:"24ea786b85c3240ae4f24dcad6f657749730c56e",
 testedAt:new Date().toISOString(),data:"synthetic-local-only",health:{},auth:{},routes:[],pageErrors:[],screenshots:[],warnings:[]};
const safeFile=s=>"gohyperlevel-"+s.replace(/[^a-z0-9-]/gi,"-")+".png";
const parse=async res=>{try{return await res.json()}catch{return null}};
const context=await browser.newContext({viewport:{width:1440,height:900},locale:"en-US",colorScheme:"light"});
try{
 const health=await context.request.get(base+"/healthz");
 const ver=await context.request.get(base+"/api/version");
 const verBody=await parse(ver);
 report.health={healthStatus:health.status(),versionStatus:ver.status(),appName:verBody?.name};
 assert.equal(health.status(),200,"/healthz");
 assert.equal(ver.status(),200,"/api/version");
 assert.equal(verBody?.name,"HyperLevel","Correct upstream application");

 const unauthed=await context.request.get(base+"/api/contacts");
 report.auth.unauthorizedContactsStatus=unauthed.status();
 assert.equal(unauthed.status(),401,"Anonymous contacts denied");

 const email=process.env.PGHL_ADMIN_EMAIL,password=process.env.PGHL_ADMIN_PASSWORD;
 assert(email?.endsWith(".invalid")&&password?.length>=20,"Synthetic credentials required");
 const login=await context.request.post(base+"/api/auth/login",{
  data:{email,password},headers:{"x-pghl":"1"}
 });
 report.auth.syntheticLoginStatus=login.status();
 assert.equal(login.status(),200,"Synthetic administrator login");

 const me=await context.request.get(base+"/api/me");
 const profile=await parse(me);
 assert.equal(me.status(),200,"Authenticated profile");
 assert(Array.isArray(profile?.locations)&&profile.locations.length===1,"Synthetic single-workspace boot");
 const workspaceId=profile.locations[0].id;
 assert(typeof workspaceId==="string"&&workspaceId.length>0);
 report.auth.syntheticWorkspace=true;

 const paths=["contacts","pipelines","funnels","courses","workflows","calendars"];
 for(const key of paths){
  const res=await context.request.get(base+"/api/"+key,{headers:{"x-location-id":workspaceId}});
  report.routes.push({kind:"api",path:"/api/"+key,status:res.status(),ok:res.ok()});
 }


 // Deliberate synthetic-only end-to-end records: no integrations, outbound messages or real clients.
 report.scenarios=[];
 const headers={"x-location-id":workspaceId,"x-pghl":"1"};
 async function createSynthetic(path,body,label){
  const res=await context.request.post(base+path,{headers,data:body});
  const value=await parse(res);
  report.scenarios.push({name:label,status:res.status(),recordCreated:Boolean(value?.id)});
  assert.equal(res.status(),200,label+" synthetic creation");
  assert(typeof value?.id==="string",label+" synthetic ID");
  return value;
 }
 const contact=await createSynthetic("/api/contacts",{
  first_name:"Synthetic",last_name:"Audit",email:"synthetic-lead@example.invalid",tags:["audit-only"]
 },"CRM contact");
 const site=await createSynthetic("/api/funnels",{
  name:"Synthetic Audit Landing Page",kind:"funnel",template:"leadmagnet"
 },"Website/funnel");
 const course=await createSynthetic("/api/courses",{
  title:"Synthetic Test Course",description:"No real learners"
 },"LMS course");
 const draft=await createSynthetic("/api/workflows",{
  name:"Synthetic Draft Workflow",
  trigger:{type:"contact.tag_added",config:{tag:"never-trigger-audit"}},
  steps:[{type:"add_tag",tags:["test-completed"]}]
 },"Inactive workflow");
 for(const [label,path] of [
  ["CRM contact","/api/contacts/"+contact.id],
  ["Website/funnel","/api/funnels/"+site.id],
  ["LMS course","/api/courses/"+course.id],
  ["Inactive workflow","/api/workflows/"+draft.id]
 ]){
  const read=await context.request.get(base+path,{headers});
  report.scenarios.push({name:label+" readback",status:read.status(),recordCreated:false});
  assert.equal(read.status(),200,label+" readback");
 }
 async function dismissOnboarding(page){
  const prompt=page.getByText("What do you want to do?",{exact:true});
  if(!await prompt.isVisible().catch(()=>false))return false;
  const dismiss=page.getByRole("button",{name:/^Later$/i});
  if(!await dismiss.count())throw new Error("Onboarding overlay blocks module audit and cannot be dismissed");
  await dismiss.first().click({timeout:4000});
  await page.waitForTimeout(400);
  if(await prompt.isVisible().catch(()=>false))throw new Error("Onboarding overlay remained open after dismissal");
  return true;
 }
 report.onboardingDismissals=0;

 const page=await context.newPage();
 page.on("pageerror",error=>report.pageErrors.push({path:new URL(page.url()).pathname,message:String(error.message).slice(0,300)}));
 const pages=["dashboard","contacts","opportunities","funnels","courses","workflows","social"];
 for(const route of pages){
  const path="/app/"+route;
  const response=await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:20000});
  await page.waitForFunction(()=>Boolean(window.__pghlMounted),null,{timeout:10000}).catch(()=>{});
  await page.waitForTimeout(650);
  if(await dismissOnboarding(page))report.onboardingDismissals++;
  const body=await page.locator("body").innerText({timeout:5000}).catch(()=>"");
  report.routes.push({kind:"ui",path,status:response?.status()||0,title:await page.title(),bodyLength:body.length,
    mounted:await page.evaluate(()=>Boolean(window.__pghlMounted)).catch(()=>false)});
  const screenshot=safeFile("desktop-"+route);
  await page.screenshot({path:join(dir,screenshot),fullPage:true,timeout:10000});
  report.screenshots.push(screenshot);
 }
 await page.setViewportSize({width:390,height:844});
 for(const route of ["dashboard","funnels","courses"]){
  const path="/app/"+route;
  await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:20000});
  await page.waitForTimeout(850);
  if(await dismissOnboarding(page))report.onboardingDismissals++;
  const size=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  report.routes.push({kind:"mobile",path,horizontalOverflowPx:Math.max(0,size.document-size.viewport)});
  const screenshot=safeFile("mobile-"+route);
  await page.screenshot({path:join(dir,screenshot),fullPage:true,timeout:10000});
  report.screenshots.push(screenshot);
 }
 if(report.routes.some(r=>r.kind==="ui"&&(r.status>=500||r.bodyLength<25)))report.warnings.push("One or more UI routes have server errors or low rendered content");
 if(report.routes.some(r=>r.kind==="mobile"&&r.horizontalOverflowPx>20))report.warnings.push("Mobile horizontal overflow detected");
 if(report.pageErrors.length)report.warnings.push("Uncaught browser exceptions recorded");
 console.log(JSON.stringify({health:report.health,auth:report.auth,routes:report.routes.map(r=>({kind:r.kind,path:r.path,status:r.status,bodyLength:r.bodyLength,mounted:r.mounted,horizontalOverflowPx:r.horizontalOverflowPx})),warnings:report.warnings,scenarios:report.scenarios,onboardingDismissals:report.onboardingDismissals,screenshotCount:report.screenshots.length},null,2));
}finally{
 writeFileSync(join(dir,"audit-summary.json"),JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
