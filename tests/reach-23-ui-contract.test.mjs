import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const catalog=read("ghl-gpt-gateway/app/reach-ui-23.tsx");
const command=read("ghl-gpt-gateway/app/reach-command-center.tsx");
const app=read("ghl-gpt-gateway/app/page.tsx");
const css=read("ghl-gpt-gateway/app/reach-ui-23.css");
const layout=read("ghl-gpt-gateway/app/layout.tsx");
const social=read("ghl-gpt-gateway/app/social-studio.tsx");
const paths=["command","directory","workspaces","contacts","inbox","calls","pipelines","social","social-analytics","social-inbox","social-connections","social-calendar","social-comments","web-home","website","web-domains","web-analytics","web-seo","web-publishing","marketing-home","funnels","social-ads","search-ads","email-campaigns","campaign-reporting","reviews","automations","tasks","calendar","courses","ai","insights","reporting","neon","integrations","features","settings","migration"];
test("feature directory includes all 38 unique capabilities and eight owner groups",()=>{
 const entries=[...catalog.matchAll(/\{id:"([^"]+)",title:/g)].map(x=>x[1]);
 assert.deepEqual(entries,paths);
 assert.equal(new Set(entries).size,38);
 for(const group of ["Workspace","Customers","Social Media","Web Design","Marketing","Operations","Intelligence","Platform"]){
  assert.match(catalog,new RegExp('group:"'+group+'"'));
 }
});
test("not-yet-built interactions remain labeled planned, source-only or disabled",()=>{
 for(const feature of ["inbox","calls","reviews","tasks","ai","reporting"]){
  assert.match(catalog,new RegExp('id:"'+feature+'"[^\\n]+status:"planned"'));
 }
 assert.match(catalog,/f\.status!=="disabled"&&Boolean\(f\.screen\|\|f\.href\)/);
 assert.match(catalog,/disabled aria-label=\{f\.title\+" unavailable"\}/);
 assert.match(catalog,/Source only/);
});
test("owner-only staging screens preserve their existing authentication gates",()=>{
 assert.match(app,/session\.authenticated&&<PlatformWorkspaces\/>/);
 assert.match(app,/view==="social"&&\(!session\.authenticated\?/);
 assert.match(app,/view==="services"&&\(!session\.authenticated\?/);
 assert.match(app,/fetch\("\/api\/portal\/session"/);
 assert.match(app,/credentials:"same-origin"/);
 assert.match(app,/<SocialStudio\/>/);
 assert.match(app,/<ServiceCatalog\/>/);
});
test("feature search is keyboard-accessible and does not launch unavailable features",()=>{
 assert.match(app,/e\.ctrlKey\|\|e\.metaKey/);
 assert.match(app,/e\.key\.toLowerCase\(\)==="k"/);
 assert.match(app,/e\.key==="Escape"/);
 assert.match(app,/role="dialog" aria-modal="true"/);
 assert.match(app,/disabled=\{!featureOpenable\(f\)\}/);
 assert.match(app,/onClick=\{\(\)=>openFeature\(f\)\}/);
});
test("theme and accent controls are presentation-only",()=>{
 assert.match(app,/data-theme=\{theme\} data-accent=\{accent\}/);
 assert.match(app,/setTheme\(t=>t==="dark"\?"light":"dark"\)/);
 assert.match(app,/setAccent\(e\.target\.value/);
 assert.match(css,/data-theme=light/);
 assert.match(css,/data-accent=emerald/);
 assert.doesNotMatch(app,/localStorage|sessionStorage/);
});
test("social deep links route only to existing internal tabs",()=>{
 for(const kind of ["connections","calendar","media","insights","posting","metrics","content"]){
  assert.match(app,new RegExp('"'+kind+'"'));
  assert.match(social,new RegExp('"'+kind+'"'));
 }
 assert.match(social,/setTab\(socialView==="connections"\?"providers"/);
 assert.match(catalog,/href:"\/connections"/);
 assert.match(catalog,/href:"\/\?social=calendar"/);
 assert.match(catalog,/href:"\/\?social=comments"/);
 assert.match(catalog,/href:"\/\?social=insights"/);
});
test("dashboard personalization uses a validated owner-only staging layout endpoint",()=>{
 assert.match(command,/setLayout\(old=>update\(old\)\)/);
 assert.match(command,/loadCommandJson\("\/api\/platform\/command-center\/layout"/);
 assert.match(command,/expectedRevision:layoutRevision/);
 assert.match(command,/setLayoutRevision\(result\.revision\)/);
 assert.doesNotMatch(command,/localStorage|sessionStorage|navigator\.sendBeacon/);
 assert.match(command,/saveEnabled/);
});
test("staging boundary is visible and outbound/social operations are not introduced",()=>{
 assert.match(app,/LIMITED RELEASE/);
 assert.match(app,/No external publishing/);
 assert.match(catalog,/publishing disabled/);
 assert.doesNotMatch(catalog,/fetch\(|axios|Authorization:|client_secret|access_token/);
 assert.doesNotMatch(app,/\/api\/platform\/social\/dispatch.+method:"POST"/);
});
test("owner can reach existing functional pages and isolated connections",()=>{
 for(const url of ["/connections","/connections#neon"]){
  assert.ok(catalog.includes('href:"'+url+'"'));
 }
 for(const view of ["directory","clients","social","services","settings","features"]){
  assert.match(app,new RegExp('view==="'+view+'"'));
 }
});
test("responsive shell supports reduced motion, focus indication and mobile navigation",()=>{
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/:focus-visible/);
 assert.match(app,/aria-label="Mobile quick navigation"/);
 assert.match(app,/aria-label="Open all feature navigation"/);
 assert.match(app,/aria-label="Close feature navigation"/);
});
test("layout imports redesign last and offline shell mirror remains byte-identical",()=>{
 assert.match(layout,/import "\.\/portal\.css";[\s\S]+import "\.\/social\.css";[\s\S]+import "\.\/reach-ui-23\.css";/);
 assert.equal(readFileSync(new URL("../reach-shell/index.html",import.meta.url)).compare(readFileSync(new URL("../ghl-gpt-gateway/public/reach-demo/index.html",import.meta.url))),0);
});

test("global toolbar is mounted once, authenticated and collapsible on business routes",()=>{
 const toolbar=read("ghl-gpt-gateway/app/reach-global-toolbar.tsx");
 assert.match(layout,/<ReachGlobalToolbar\/>\{children\}/);
 assert.match(toolbar,/fetch\("\/api\/portal\/session"/);
 assert.match(toolbar,/if\(!authenticated\|\|pathname==="\/login"\)return null/);
 assert.match(toolbar,/aria-expanded=\{open===group\}/);
 assert.match(toolbar,/aria-controls="reach-global-menu"/);
 assert.match(app,/aria-expanded=\{!collapsed.includes\(group\)\}/);
 assert.match(app,/reach-session-change/);
});
test("marketing contains campaign tools rather than ordinary website or social navigation",()=>{
 const rows=[...catalog.matchAll(/\{id:"([^"]+)",title:"[^"]+",group:"([^"]+)"/g)];
 const groups=Object.fromEntries(rows.map(x=>[x[1],x[2]]));
 for(const id of ["social","social-calendar","social-analytics","social-comments","social-inbox"])assert.equal(groups[id],"Social Media");
 assert.equal(groups["social-connections"],"Platform");assert.equal(groups.insights,"Operations");
 for(const id of ["website","web-domains","web-analytics","web-seo","web-publishing"])assert.equal(groups[id],"Web Design");
 for(const id of ["funnels","social-ads","search-ads","email-campaigns","campaign-reporting","reviews"])assert.equal(groups[id],"Marketing");
 assert.match(app,/view==="web"\|\|view==="marketing"/);
 assert.match(app,/session.authenticated\?<ReachBusinessArea/);
 assert.match(social,/socialView==="metrics"\?"metrics":socialView==="content"\?"metrics"/);
});

test("production social calendar is a real month view, not a redirect to posting",()=>{
 const calendar=read("ghl-gpt-gateway/app/meta-social-calendar.tsx");
 assert.match(social,/productionSocial\?\[\["automations","Create & Schedule"\],\["calendar","Calendar"\],\["metrics","Analytics"\],\["inbox","Inbox"\],\["comments","Comments"\],\["business_tools","Business tools"\]\]/);
 assert.match(social,/mode=\{tab==="calendar"\?"calendar"/);
 assert.match(calendar,/Array\.from\(\{length:42\}/);
 assert.match(calendar,/a\.scheduledAt/);
 assert.match(calendar,/a\.status!=="canceled"/);
 assert.match(calendar,/e\.occurredAt/);
 assert.doesNotMatch(calendar,/fetch\(|method:"POST"/);
 assert.match(read("ghl-gpt-gateway/app/connections/page.tsx"),/<h1>Connections Center<\/h1>/);
});

test("central infrastructure and web links replace the retired Published Content navigation",()=>{
 assert.doesNotMatch(catalog,/title:"Published Content"/);assert.doesNotMatch(social,/\["content","Published Content"\]/);
 assert.match(catalog,/href:"\/connections#domains"/);assert.match(catalog,/href:"\/connections#neon"/);
 const hub=read("ghl-gpt-gateway/app/connections/page.tsx");assert.match(hub,/<InfrastructureCards/);
 const route=read("ghl-gpt-gateway/app/api/reach/infrastructure/route.ts");
 assert.match(route,/connectionGate\(req,true\)/);assert.match(route,/ownerSocialStorageConfigured/);assert.match(route,/REACH_SOCIAL_OWNER_WORKSPACE_ID/);
 assert.match(route,/pg_database_size\(current_database\(\)\)/);assert.match(route,/quotaBytes:null/);assert.match(route,/ON CONFLICT\(hostname\) DO NOTHING/);assert.match(route,/dnsChanged:false/);
 assert.doesNotMatch(route,/DELETE FROM|ALTER TABLE|DROP TABLE|UPDATE public/);
});
