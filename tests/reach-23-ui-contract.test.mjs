import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const catalog=read("ghl-gpt-gateway/app/reach-ui-23.tsx");
const app=read("ghl-gpt-gateway/app/page.tsx");
const css=read("ghl-gpt-gateway/app/reach-ui-23.css");
const layout=read("ghl-gpt-gateway/app/layout.tsx");
const social=read("ghl-gpt-gateway/app/social-studio.tsx");
const paths=[
 "command","directory","workspaces","contacts","inbox","calls","pipelines","social",
 "social-connections","social-calendar","media","website","funnels","reviews","automations",
 "tasks","calendar","courses","ai","insights","reporting","neon","integrations","features",
 "settings","migration"
];
test("feature directory includes all 26 unique capabilities and six owner groups",()=>{
 const entries=[...catalog.matchAll(/\{id:"([^"]+)",title:/g)].map(x=>x[1]);
 assert.deepEqual(entries,paths);
 assert.equal(new Set(entries).size,26);
 for(const group of ["Workspace","Customers","Marketing","Operations","Intelligence","Platform"]){
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
 for(const kind of ["connections","calendar","media","insights"]){
  assert.match(app,new RegExp('"'+kind+'"'));
  assert.match(social,new RegExp('"'+kind+'"'));
 }
 assert.match(social,/setTab\(socialView==="connections"\?"providers"/);
 assert.match(catalog,/href:"\/\?social=connections"/);
 assert.match(catalog,/href:"\/\?social=calendar"/);
 assert.match(catalog,/href:"\/\?social=media"/);
 assert.match(catalog,/href:"\/\?social=insights"/);
});
test("dashboard customization never transmits or persists dashboard data",()=>{
 assert.match(catalog,/setOrder\(old=>/);
 assert.match(catalog,/setHidden\(x=>/);
 assert.match(catalog,/setWide\(x=>/);
 assert.match(catalog,/session only/);
 assert.doesNotMatch(catalog,/fetch\(|localStorage|sessionStorage|navigator\.sendBeacon/);
});
test("staging boundary is visible and outbound/social operations are not introduced",()=>{
 assert.match(app,/STAGING ONLY/);
 assert.match(app,/No external publishing/);
 assert.match(catalog,/publishing disabled/);
 assert.doesNotMatch(catalog,/fetch\(|axios|Authorization:|client_secret|access_token/);
 assert.doesNotMatch(app,/\/api\/platform\/social\/dispatch.+method:"POST"/);
});
test("owner can reach existing functional pages and isolated connections",()=>{
 for(const url of ["/?social=connections","/reach-connections"]){
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
