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
  assert.match(src,/publishingEnabled:false/);
  assert.doesNotMatch(src,/export async function POST|export async function DELETE|console\.log/);
 }
 const ui=read("app/social-studio.tsx");
 assert.match(ui,/Check permissions/);
 assert.match(ui,/Load live analytics/);
 assert.match(ui,/Social analytics and posting permissions/);
 assert.doesNotMatch(ui,/fetch\("https:\/\/graph\.facebook\.com/);
});
