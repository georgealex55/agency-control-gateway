import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const ts=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url))("typescript");
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const capSource=read("lib/social-meta-capabilities.ts").replace(
 'import {validGraphVersion,type MetaProvider} from "@/lib/social-meta-contract";',
 'const validGraphVersion=v=>typeof v==="string"&&/^v[0-9]+\\.[0-9]+$/.test(v);');
const cap=await import("data:text/javascript;base64,"+Buffer.from(transpile(capSource)).toString("base64"));
const analyticsSource=read("lib/social-meta-analytics.ts").replace(
 'import {appSecretProof,type MetaLoginMode} from "@/lib/social-meta-capabilities";',
 'const appSecretProof=()=> "test-proof";').replace(
 'import {validGraphVersion} from "@/lib/social-meta-contract";',
 'const validGraphVersion=v=>typeof v==="string"&&/^v[0-9]+\\.[0-9]+$/.test(v);');
const analytics=await import("data:text/javascript;base64,"+Buffer.from(transpile(analyticsSource)).toString("base64"));
const appId="123456789012",secret="test-secret-for-meta-app",userToken="fb-user-synthetic-token";
const pageToken="fb-page-synthetic-token",accountId="998877665544";
test("permission matrix reports implementation separately from granted Meta scopes",()=>{
 const none=cap.metaFeatureReadiness("facebook",[]);
 assert.equal(none.find(x=>x.id==="analytics").status,"permission_required");
 const permitted=cap.metaFeatureReadiness("facebook",["pages_show_list","pages_read_engagement","pages_manage_posts"]);
 assert.equal(permitted.find(x=>x.id==="analytics").status,"available");
 assert.equal(permitted.find(x=>x.id==="publishing").status,"not_activated");
 assert.equal(permitted.find(x=>x.id==="scheduling").status,"not_activated");
 assert.equal(cap.metaFeatureReadiness("instagram_unified",null)[0].status,"unverified");
 assert.equal(cap.metaFeatureRequirements("instagram_direct").publishing[0],"instagram_business_content_publish");
});
test("Meta token scope inspection verifies app and respects granular asset-level access",async()=>{
 const seen=[];
 const fetcher=async(url,options)=>{
  seen.push({url,options});
  return new Response(JSON.stringify({data:{app_id:appId,is_valid:true,expires_at:1900000000,
   scopes:["pages_show_list","pages_read_engagement","pages_manage_posts"],
   granular_scopes:[{scope:"pages_manage_posts",target_ids:["111111111111"]}]}}),{status:200});
 };
 const result=await cap.inspectMetaToken({provider:"facebook_pages",token:userToken,accountId,
  appId,appSecret:secret,version:"v27.0",fetcher,now:1700000000000});
 assert.equal(result.verified,true);
 assert.equal(result.grantedScopes.includes("pages_manage_posts"),false);
 assert.equal(result.grantedScopes.includes("pages_read_engagement"),true);
 assert.equal(seen[0].options.method,"GET");
 assert.equal(seen[0].options.redirect,"error");
 assert.equal(new URL(seen[0].url).origin,"https://graph.facebook.com");
 assert.equal(seen[0].options.headers.Authorization,"Bearer "+appId+"|"+secret);
 assert.doesNotMatch(JSON.stringify(result),/fb-user-synthetic-token|test-secret-for-meta-app/);
 const denied=await cap.inspectMetaToken({provider:"facebook_pages",token:userToken,accountId,appId,
  appSecret:secret,version:"v27.0",now:1700000000000,fetcher:async()=>
  new Response(JSON.stringify({data:{app_id:"777777777777",is_valid:true,scopes:["pages_manage_posts"]}}))});
 assert.equal(denied.verified,false);
});
test("Facebook read uses its specific Page token and never issues an external POST",async()=>{
 const seen=[];const fetcher=async(url,init)=>{
  const u=new URL(url);seen.push({u,init});
  assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
  assert.equal(u.origin,"https://graph.facebook.com");assert.equal(u.searchParams.has("access_token"),false);
  if(u.pathname.endsWith("/me/accounts"))return new Response(JSON.stringify({data:[
   {id:"111111111111",access_token:"other-page-token"},
   {id:accountId,name:"Test Page",access_token:pageToken}]}));
  if(u.pathname.endsWith("/"+accountId))return new Response(JSON.stringify({
   id:accountId,name:"Test Page",followers_count:57,fan_count:50}));
  if(u.pathname.endsWith("/published_posts"))return new Response(JSON.stringify({data:[
   {id:"998877665544_1234",message:"Hello",created_time:"2026-11-25T10:00:00+0000",
    comments:{summary:{total_count:2}},reactions:{summary:{total_count:4}},shares:{count:1}}]}));
  throw Error("Unapproved path");
 };
 const value=await analytics.fetchMetaAnalytics({mode:"facebook",token:userToken,appSecret:secret,
  version:"v27.0",accountId,grantedPermissions:["pages_read_engagement"],fetcher});
 assert.equal(value.followers,57);assert.equal(value.recentLikes,4);assert.equal(value.recentComments,2);
 assert.equal(value.reach,null);assert.equal(value.liveProviderRead,true);assert.equal(value.partial,false);
 assert.equal(seen.length,3);assert.equal(seen[0].init.headers.Authorization,"Bearer "+userToken);
 assert.equal(seen[1].init.headers.Authorization,"Bearer "+pageToken);
 assert.doesNotMatch(JSON.stringify(value),/fb-page-synthetic-token|fb-user-synthetic-token|test-secret-for-meta-app/);
});
test("Instagram real data never invents followers, reach or engagement values",async()=>{
 const fetcher=async(url,init)=>{
  const u=new URL(url);assert.equal(u.origin,"https://graph.instagram.com");assert.equal(init.method,"GET");
  if(u.pathname.endsWith("/"+accountId))return new Response(JSON.stringify({id:accountId,username:"testbiz",media_count:8}));
  return new Response(JSON.stringify({data:[]}));
 };
 const v=await analytics.fetchMetaAnalytics({mode:"instagram_direct",token:userToken,appSecret:secret,
  version:"v27.0",accountId,grantedPermissions:["instagram_business_basic"],fetcher});
 assert.equal(v.followers,null);assert.equal(v.reach,null);assert.equal(v.recentLikes,null);assert.equal(v.partial,false);
});
test("Meta access and analytics GETs are owner-gated and do not expose tokens or publish",()=>{
 for(const path of ["app/api/platform/social/meta/capabilities/route.ts","app/api/platform/social/meta/analytics/route.ts"]){
  const src=read(path);
  assert.match(src,/connectionGate\(req\)/);
  assert.match(src,/metaConnectionCredential\(workspaceId,connectionId/);
  assert.match(src,/inspectMetaToken\(/);
  if(path.includes("/analytics/"))assert.match(src,/publishingEnabled:false/);
  else {assert.match(src,/publishingEnabled:flags.liveWrites/);assert.match(src,/metaAutomationFlags\(\)/);}
  assert.doesNotMatch(src,/export async function POST|export async function DELETE|console\.log/);
 }
 const ui=read("app/social-studio.tsx");
 assert.match(ui,/Check permissions/);
 assert.match(ui,/Load live analytics/);
 assert.match(ui,/Social analytics and posting permissions/);
 assert.doesNotMatch(ui,/fetch\("https:\/\/graph\.facebook\.com/);
});

test("expanded analytics keep account and post insights distinct and preserve zero values",async()=>{
 const seen=[];
 const fetcher=async(url,init)=>{
  const u=new URL(url);seen.push(u);assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
  assert.equal(u.origin,"https://graph.instagram.com");
  if(u.pathname.endsWith("/"+accountId))return new Response(JSON.stringify({id:accountId,username:"testbiz",followers_count:10,media_count:45}));
  if(u.pathname.endsWith("/media")){
   assert.equal(u.searchParams.get("limit"),"25");
   return new Response(JSON.stringify({data:Array.from({length:12},(_,i)=>({id:String(10000+i),media_type:"VIDEO",media_product_type:"REELS",like_count:i,comments_count:0}))}));
  }
  if(u.pathname.endsWith("/insights"))return new Response(JSON.stringify({data:[
   {name:"views",period:"lifetime",values:[{value:200}]},
   {name:"reach",period:"lifetime",values:[{value:100}]},
   {name:"saved",period:"lifetime",values:[{value:0}]},
   {name:"shares",period:"lifetime",values:[{value:2}]},
   {name:"total_interactions",period:"lifetime",values:[{value:3}]}
  ]}));
  throw Error("Unexpected endpoint");
 };
 const v=await analytics.fetchMetaAnalytics({mode:"instagram_direct",token:userToken,appSecret:secret,version:"v27.0",accountId,postLimit:25,detailed:true,grantedPermissions:["instagram_business_manage_insights"],fetcher});
 assert.equal(v.period,"recent_25_posts");assert.equal(v.recentPosts.length,12);assert.equal(v.detailCoverage,10);
 assert.equal(v.recentPosts[0].format,"REEL");assert.equal(v.recentPosts[0].views,200);
 assert.equal(v.recentPosts[0].saves,0);assert.equal(v.recentPosts[10].views,null);
 assert.equal(v.reach,null);assert.equal(v.recentShares,null);
 assert.equal(seen.filter(u=>u.pathname.endsWith("/insights")).length,10);
});
test("lifetime metric parser rejects unrelated names, time series and breakdown objects",()=>{
 assert.deepEqual(analytics.readLifetimeInsights({data:[
  {name:"views",period:"lifetime",values:[{value:0}]},
  {name:"reach",period:"day",values:[{value:10}]},
  {name:"saved",period:"lifetime",values:[{value:1},{value:2}]},
  {name:"shares",period:"lifetime",values:[{value:{organic:5}}]},
  {name:"unrequested",period:"lifetime",values:[{value:99}]}
 ]},["views","reach","saved","shares"]),{views:0});
});
