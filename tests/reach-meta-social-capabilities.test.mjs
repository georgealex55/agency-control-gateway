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
 assert.equal(permitted.find(x=>x.id==="analytics").status,"permission_required");
 assert.deepEqual(permitted.find(x=>x.id==="analytics").missingPermissions,["read_insights"]);
 assert.equal(cap.metaFeatureReadiness("facebook",["pages_show_list","pages_read_engagement","read_insights"]).find(x=>x.id==="analytics").status,"available");
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

test("Meta post presentation normalizes formats without inventing unsupported metadata",()=>{
 const fb=(type,media_type,extra={})=>({attachments:{data:[{type,media_type,...extra}]}});
 assert.equal(analytics.metaPostFormat({media_type:"IMAGE"},false),"PHOTO");
 assert.equal(analytics.metaPostFormat({media_type:"CAROUSEL_ALBUM"},false),"CAROUSEL");
 assert.equal(analytics.metaPostFormat({media_type:"VIDEO",media_product_type:"REELS"},false),"REEL");
 assert.equal(analytics.metaPostFormat(fb("share","link"),true),"LINK");
 assert.equal(analytics.metaPostFormat(fb("video_inline","video"),true),"VIDEO");
 assert.equal(analytics.metaPostFormat(fb("album","photo"),true),"CAROUSEL");
 assert.equal(analytics.metaPostFormat({message:"hello",attachments:{data:[]}},true),"TEXT");
 assert.equal(analytics.metaPostFormat({message:"hello"},true),null);
 assert.equal(analytics.metaPostFormat({media_type:"unknown"},false),null);
});
test("media preview URLs are restricted to Meta image hosts, never token-bearing or arbitrary URLs",()=>{
 const good="https://scontent.example.fbcdn.net/photo.jpg";
 const thumb="https://scontent.cdninstagram.com/thumb.jpg";
 assert.equal(analytics.safeMetaPreview(good),good);
 for(const bad of ["https://fbcdn.net.evil.example/a","https://evil.example/a","http://fbcdn.net/a","https://fbcdn.net/a?access_token=secret","https://user@fbcdn.net/a","https://fbcdn.net:8443/a"])
  assert.equal(analytics.safeMetaPreview(bad),null);
 assert.deepEqual(analytics.postPreviewImages({media_type:"VIDEO",media_url:"https://fbcdn.net/video.mp4",thumbnail_url:thumb},false),[thumb]);
 assert.deepEqual(analytics.postPreviewImages({children:{data:[{media_type:"IMAGE",media_url:good},{media_type:"VIDEO",thumbnail_url:thumb},{media_type:"IMAGE",media_url:good}]}},false),[good,thumb]);
 assert.deepEqual(analytics.postPreviewImages({attachments:{data:[{media:{image:{src:good}}}]}},true),[good]);
});
test("analytics UI isolates platform and account selection from the content cards",()=>{
 const ui=read("app/meta-analytics-panel.tsx"),studio=read("app/social-studio.tsx");
 assert.match(ui,/accounts\.filter\(a=>a\.provider===activePlatform\)/);
 assert.match(ui,/snapshots\[account\.id\]/);
 assert.match(ui,/load\(account\.id\)/);
 assert.match(ui,/account\.id\+"\:"\+p\.id/);
 assert.match(ui,/referrerPolicy="no-referrer"/);
 assert.match(ui,/Read full caption/);
 assert.match(studio,/<MetaAnalyticsPanel key=\{workspaceId\}/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML/);
});

const report=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/social-report-summary.ts"))).toString("base64"));
test("format analytics distinguish missing values from real zeros and expose denominators",()=>{
 const p=(format,likes,views)=>({format,likes,views,comments:null,shares:null,reach:null,saves:null,interactions:null,uniqueViewers:null,createdAt:null});
 const posts=[p("PHOTO",0,20),p("PHOTO",null,null),p("REEL",5,100),p(null,null,null)];
 const groups=report.groupPostFormats(posts);
 assert.deepEqual(groups.map(g=>g.format),["PHOTO","REEL","unknown"]);
 assert.deepEqual(groups[0].metrics.likes,{sum:0,known:1,total:2,average:0});
 assert.deepEqual(groups[0].metrics.views,{sum:20,known:1,total:2,average:20});
 assert.deepEqual(groups[2].metrics.likes,{sum:null,known:0,total:1,average:null});
 assert.deepEqual(report.metricSummary(posts,"views"),{sum:120,known:2,total:4,average:60});
 assert.equal(report.postActivity(posts).reduce((a,d)=>a+d.count,0),0);
 const ui=read("app/meta-analytics-panel.tsx");
 assert.match(ui,/groupPostFormats\(posts\)/);
 assert.match(ui,/m.known\}\/\{m.total\} reported/);
 assert.match(ui,/not deduplicated/);
});

test("account insights retain a provider window and never sum overlapping unique viewers",async()=>{
 const common={mode:"facebook",version:"v27.0",token:pageToken,appSecret:secret,accountId};
 const now=Date.parse("2026-11-26T12:00:00Z");
 const res=await analytics.fetchAccountInsights({...common,fetcher:async(url,init)=>{
  const u=new URL(url);assert.equal(init.method,"GET");assert.equal(u.origin,"https://graph.facebook.com");assert.equal(u.searchParams.get("period"),"days_28");
  const name=u.searchParams.get("metric");
  if(name==="page_total_actions")return new Response("denied",{status:403});
  return new Response(JSON.stringify({data:[{name,period:"days_28",values:[{end_time:"2026-11-24T00:00:00Z",value:10},{end_time:"2026-11-25T00:00:00Z",value:15},{end_time:"2026-11-27T00:00:00Z",value:999}]}]}));
 }},true,now);
 assert.equal(res.status,"partial");assert.equal(res.metrics.length,2);assert.equal(res.metrics[0].value,15);
 const ig=await analytics.fetchAccountInsights({...common,mode:"instagram_direct",fetcher:async(url)=>{
  const u=new URL(url);assert.equal(u.origin,"https://graph.instagram.com");assert.equal(u.searchParams.get("metric_type"),"total_value");
  assert.equal(Number(u.searchParams.get("until"))-Number(u.searchParams.get("since")),28*86400);
  return new Response(JSON.stringify({data:[{name:u.searchParams.get("metric"),period:"day",total_value:{value:0}}]}));
 }},true,now);
 assert.equal(ig.status,"available");assert.equal(ig.metrics.length,6);assert.equal(ig.metrics[0].value,0);
 const denied=await analytics.fetchAccountInsights({...common,fetcher:async()=>{throw Error("Unexpected request");}},false,now);
 assert.equal(denied.status,"unavailable");assert.deepEqual(denied.metrics,[]);
});

const permissionContract=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/social-meta-contract.ts"))).toString("base64"));
test("Facebook requests only basic access plus the selected feature, never other optional scopes",()=>{
 const basic=["pages_show_list","pages_read_engagement"];
 const options={analytics:"read_insights",publishing:"pages_manage_posts",comments:"pages_manage_engagement",messages:"pages_messaging",webhooks:"pages_manage_metadata"};
 const common={clientId:appId,redirectUri:"https://agency-control-gateway.vercel.app/api/platform/social/meta/callback",state:"a".repeat(64),graphVersion:"v27.0"};
 for(const [preset,scope] of Object.entries(options)){
  assert.deepEqual(permissionContract.metaRequestedPermissions("facebook_pages",preset),[...basic,scope]);
  const url=new URL(permissionContract.buildMetaAuthorizeURL({...common,provider:"facebook_pages",permissionPreset:preset}));
  assert.equal(url.origin,"https://www.facebook.com");
  assert.deepEqual(url.searchParams.get("scope").split(","),[...basic,scope]);
  assert.equal(url.searchParams.get("auth_type"),"rerequest");
  assert.equal(permissionContract.validMetaPermissionPreset("instagram_professional",preset),false);
 }
 assert.equal(permissionContract.validMetaPermissionPreset("facebook_pages","arbitrary_scope"),false);
 assert.throws(()=>permissionContract.metaRequestedPermissions("facebook_pages","arbitrary_scope"));
 assert.deepEqual(permissionContract.metaRequestedPermissions("facebook_pages","basic"),basic);
 assert.deepEqual(permissionContract.metaRequestedPermissions("instagram_professional","basic"),["instagram_business_basic"]);
 assert.equal(permissionContract.metaRequestedPermissions("instagram_professional","social_tools").length,5);
 const route=read("app/api/platform/social/meta/start/route.ts"),ui=read("app/connections/page.tsx");
 assert.match(route,/validMetaPermissionPreset\(input.provider,requested\)/);
 assert.match(route,/metaRequestedPermissions\(input.provider,preset\)/);
 assert.match(ui,/start\("facebook",option.id\)/);
 assert.match(ui,/checkPermissions\(c.id\)/);
 assert.match(ui,/trustedMetaAuth\(result.authorizeUrl,provider\)/);
});
test("Facebook reauthorization rejects unverifiable grants, lost scopes and missing baseline permission",()=>{
 const grant=(scopes,verified=true,reason="verified")=>({verified,reason,grantedScopes:scopes,expiresAt:null});
 const basic=["pages_show_list","pages_read_engagement"],old=grant([...basic,"pages_manage_posts"]);
 assert.equal(cap.canReplaceFacebookGrant(old,grant([...basic,"pages_manage_posts","read_insights"])),true);
 assert.equal(cap.canReplaceFacebookGrant(old,grant([...basic,"read_insights"])),false);
 assert.equal(cap.canReplaceFacebookGrant(old,grant([],false,"unavailable")),false);
 assert.equal(cap.canReplaceFacebookGrant(grant([],false,"unavailable"),grant(basic)),false);
 assert.equal(cap.canReplaceFacebookGrant(grant([],false,"invalid"),grant(basic)),true);
 assert.equal(cap.canReplaceFacebookGrant(grant([],false,"invalid"),grant(["read_insights"])),false);
 const store=read("lib/social-meta-connection-store.ts");
 assert.match(store,/canReplaceFacebookGrant\(prior,next\)/);
 assert.match(store,/agency_social_meta_connections.encrypted_access_token=\$9/);
 assert.match(store,/ON CONFLICT\(workspace_id,provider,provider_account_id\) DO UPDATE/);
 const callback=read("app/api/platform/social/meta/callback/route.ts");
 assert.match(callback,/permission_denied/);
 assert.doesNotMatch(callback,/searchParams.get\("error_description"\)/);
});

test("Messenger activity uses only the selected Page token and bounded read-only metadata",async()=>{
 const scopes=["pages_show_list","pages_read_engagement","pages_messaging","pages_manage_metadata"];
 const seen=[];const fetcher=async(url,init)=>{
  const u=new URL(url);seen.push({u,init});assert.equal(init.method,"GET");assert.equal(init.redirect,"error");assert.equal(u.origin,"https://graph.facebook.com");assert.equal(u.searchParams.has("access_token"),false);
  if(u.pathname.endsWith("/me/accounts"))return new Response(JSON.stringify({data:[{id:"111111111111",access_token:"unrelated-page-token"},{id:accountId,access_token:pageToken}]}));
  assert.equal(init.headers.Authorization,"Bearer "+pageToken);
  if(u.pathname.endsWith("/conversations")){assert.equal(u.searchParams.get("fields"),"id,updated_time");assert.equal(u.searchParams.get("limit"),"25");return new Response(JSON.stringify({data:[{id:"t_123",updated_time:"2026-11-25T12:00:00Z",message:"private body"},{id:"t_123",updated_time:"2026-11-25T12:00:00Z"}],paging:{next:"secret-pagination-url"}}));}
  return new Response(JSON.stringify({id:accountId,unread_message_count:0}));
 };
 const input={accountId,version:"v27.0",token:userToken,appSecret:secret,grantedPermissions:scopes,fetcher};
 const result=await analytics.fetchFacebookInboxActivity(input);
 assert.equal(result.recentConversationCount,1);assert.equal(result.unreadMessages,0);assert.equal(result.moreAvailable,true);
 assert.equal(result.lastActivity.length,1);assert.equal(seen.length,3);
 assert.doesNotMatch(JSON.stringify(result),/private body|t_123|secret-pagination-url|fb-page-synthetic-token/);
 await assert.rejects(()=>analytics.fetchFacebookInboxActivity({...input,grantedPermissions:[],fetcher:async()=>{throw Error("should not call provider");}}),/Missing Messenger permissions/);
 const route=read("app/api/platform/social/meta/inbox-activity/route.ts"),ui=read("app/meta-automation-panel.tsx");
 assert.match(route,/connectionGate\(req\)/);assert.match(route,/inspectMetaToken/);assert.match(route,/publishingEnabled:false/);
 assert.doesNotMatch(route,/export async function (POST|PATCH|DELETE)/);
 assert.match(ui,/Schedule manually in Meta Business Suite/);
 assert.match(ui,/Do not approve it for automatic delivery/);
 assert.match(ui,/Load Messenger activity/);
});

test("Meta expansion restricts reports to verified scopes, exact discovered assets and GET requests",async()=>{
 const seen=[];const fetcher=async(url,init)=>{
  const u=new URL(url);seen.push(u.pathname);assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
  if(u.pathname.endsWith("/me/adaccounts"))return new Response(JSON.stringify({data:[{id:"act_12345",name:"Demo",currency:"USD"}]}));
  if(u.pathname.endsWith("/act_12345/insights"))return new Response(JSON.stringify({data:[{spend:"0",impressions:"0",clicks:"2",account_currency:"USD"}]}));
  if(u.pathname.endsWith("/me/businesses"))return new Response(JSON.stringify({data:[{id:"12345",name:"Demo"}]}));
  if(u.pathname.endsWith("/me/accounts"))return new Response(JSON.stringify({data:[{id:accountId,access_token:pageToken}]}));
  if(u.pathname.endsWith("/leadgen_forms"))return new Response(JSON.stringify({data:[{id:"45678",name:"Form"}]}));
  if(u.pathname.endsWith("/45678/leads"))return new Response(JSON.stringify({data:[{id:"98765",created_time:"2026-11-20T00:00:00Z",field_data:[{name:"email",values:["synthetic@example.invalid"]},{name:"custom_question",values:["private"]}]}]}));
  if(u.pathname.endsWith("/media"))return new Response(JSON.stringify({data:[{id:"88888",comments_count:1}]}));
  if(u.pathname.endsWith("/88888/comments"))return new Response(JSON.stringify({data:[{id:"33333",timestamp:"2026-11-20T00:00:00Z",text:"private comment"}]}));
  throw Error("Unexpected request "+u.pathname);
 };
 const common={mode:"facebook",accountId,version:"v27.0",token:userToken,appSecret:secret,fetcher};
 const ads=await analytics.fetchMetaExpansion({...common,feature:"ads",grantedPermissions:["ads_read"],assetId:"act_12345"});
 assert.equal(ads.rows[0].spend,"0");assert.equal(ads.rows[0].impressions,0);
 await assert.rejects(()=>analytics.fetchMetaExpansion({...common,feature:"ads",grantedPermissions:["ads_read"],assetId:"act_99999"}),/not in verified inventory/);
 await assert.rejects(()=>analytics.fetchMetaExpansion({...common,feature:"ads",grantedPermissions:[]}),/Missing required permissions/);
 assert.equal((await analytics.fetchMetaExpansion({...common,feature:"businesses",grantedPermissions:["business_management"]})).rows.length,1);
 const leads={...common,feature:"leads",grantedPermissions:["ads_management","leads_retrieval","pages_show_list","pages_read_engagement","pages_manage_ads"],assetId:"45678"};
 assert.doesNotMatch(JSON.stringify(await analytics.fetchMetaExpansion(leads)),/synthetic@example|private/);
 const contacts=await analytics.fetchMetaExpansion({...leads,includeContacts:true});
 assert.equal(contacts.rows[0].contacts[0].value,"synthetic@example.invalid");assert.doesNotMatch(JSON.stringify(contacts),/private|custom_question/);
 await assert.rejects(()=>analytics.fetchMetaExpansion({...leads,assetId:"99999"}),/not in selected Page inventory/);
 const ig=await analytics.fetchMetaExpansion({...common,mode:"instagram_unified",feature:"instagram_comments",grantedPermissions:["instagram_basic","instagram_manage_comments"],assetId:"88888"});
 assert.equal(ig.rows.length,1);assert.doesNotMatch(JSON.stringify(ig),/private comment|33333/);
 await assert.rejects(()=>analytics.fetchMetaExpansion({...common,mode:"instagram_unified",feature:"ads",grantedPermissions:["ads_read"]}),/Invalid Meta expansion request/);
 const route=read("app/api/platform/social/meta/expansion/route.ts");
 assert.match(route,/connectionGate\(req\)/);assert.match(route,/inspectMetaToken/);assert.match(route,/publishingEnabled:false/);
 assert.doesNotMatch(route,/export async function (POST|PATCH|DELETE)/);
 const credentials=read("lib/social-meta-connection-store.ts").split("export async function metaConnectionCredential")[1].split("export async function markMetaVerified")[0];
 assert.match(credentials,/workspace_id=\$1::uuid AND id=\$2::uuid AND revoked_at IS NULL/);
});

const summary=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/social-intelligence-summary.ts"))).toString("base64"));
test("unified social intelligence preserves missing observations, zeroes, coverage and unique asset accounting",()=>{
 assert.deepEqual(summary.observed([null,0,4,undefined]),{value:4,known:2,total:4});
 assert.equal(summary.observed([null,undefined]).value,null);
 const post=(likes,comments,format="PHOTO")=>({likes,comments,shares:null,createdAt:"2026-11-20T12:00:00Z",format});
 const profiles=[{id:"a",name:"A",provider:"facebook_pages",snapshot:{followers:100,recentPosts:[post(0,0),post(10,null),post(5,5)],accountInsights:{metrics:[{name:"page_media_view",value:0}]}}},{id:"b",name:"B",provider:"instagram_professional",snapshot:null}];
 const p=summary.profilePerformance(profiles[0]);
 assert.equal(p.avg,5);assert.equal(p.rate,5);assert.equal(p.completePosts,2);assert.equal(p.views,0);assert.equal(p.reach,null);
 assert.equal(summary.profilePerformance(profiles[1]).avg,null);
 assert.equal(summary.ranked(profiles,r=>summary.profilePerformance(r).avg).length,1);
 assert.equal(summary.dedupeAssets([{assetId:"act_1"},{assetId:"act_1"},{assetId:"act_2"}]).length,2);
 assert.equal(summary.publishingActivity(profiles,Date.parse("2026-11-27")).reduce((n,x)=>n+x.count,0),3);
 assert.equal(summary.contentGroups(profiles)[0].complete,2);
 assert.ok(summary.priorityNotes(profiles,Date.parse("2026-11-27")).some(n=>n.name==="B"));
});
test("unified scan rejects missing scope before provider requests and keeps details contact-free",async()=>{
 const input={mode:"facebook",accountId,version:"v27.0",token:userToken,appSecret:secret,grantedPermissions:[],fetcher:async()=>{throw Error("Unexpected call");}};
 const result=await analytics.scanMetaExtras(input);
 assert.equal(result.reports.length,3);assert.ok(result.reports.every(r=>r.status==="permission_required"));
 assert.equal(result.inbox.status,"permission_required");assert.equal(result.trends.status,"permission_required");
 const route=read("app/api/platform/social/meta/intelligence/route.ts"),ui=read("app/meta-intelligence-panel.tsx"),studio=read("app/social-studio.tsx");
 assert.match(route,/connectionGate\(req\)/);assert.match(route,/inspectMetaToken/);assert.match(route,/publishingEnabled:false/);
 assert.doesNotMatch(route,/export async function (POST|PATCH|DELETE)/);
 assert.match(ui,/slice\(0,12\)/);assert.match(ui,/i\+=2/);assert.match(ui,/snapshot.accountId===a.accountId/);
 assert.match(studio,/productionSocial&&tab==="metrics"&&<MetaIntelligencePanel/);
 const seen=[];
 const fetcher=async(url,opts)=>{const u=new URL(url);seen.push(u);assert.equal(opts.method,"GET");
  if(u.pathname.endsWith("/me/adaccounts"))return new Response(JSON.stringify({data:[{id:"act_12345",name:"Test",currency:"USD"}]}));
  if(u.pathname.endsWith("/act_12345/insights"))return new Response(JSON.stringify({data:[{spend:"0",impressions:"0",clicks:"0"}]}));
  throw Error("Unexpected route");
 };
 const ad=await analytics.scanMetaExtras({...input,grantedPermissions:["ads_read"],fetcher});
 assert.equal(ad.reports.find(r=>r.feature==="ads").details[0].data.rows[0].spend,"0");
 assert.ok(seen.every(u=>!u.searchParams.has("access_token")&&!String(u).includes("field_data")));
});

test("profile-first analytics has independent scan scopes and honest health states",()=>{
 const now=Date.parse("2026-11-27T00:00:00Z"),p={id:"a",name:"A",provider:"facebook_pages",snapshot:null};
 assert.ok(summary.profileHealth(p,null,now).every(h=>h.status==="unknown"));
 const snapshot={followers:100,recentPosts:Array.from({length:3},()=>({likes:0,comments:0,shares:null,createdAt:"2026-10-01T12:00:00Z"})),accountInsights:{metrics:[{name:"page_media_view",value:0},{name:"page_total_media_view_unique",value:0}]},partial:false};
 const h=summary.profileHealth({...p,snapshot},2,now);
 assert.equal(h.find(x=>x.name==="Exposure").status,"observed");
 for(const name of ["Engagement","Publishing","Customer activity"])assert.equal(h.find(x=>x.name===name).status,"attention");
 assert.equal(summary.profileHealth({...p,snapshot},null,now).find(x=>x.name==="Customer activity").status,"unknown");
 const ui=read("app/meta-intelligence-panel.tsx"),studio=read("app/social-studio.tsx");
 assert.match(ui,/scanAll\("profile"\)/);assert.match(ui,/scanAll\("all"\)/);assert.match(ui,/scope==="all"\|\|a.id===account\?\.id/);
 assert.match(ui,/old.filter\(s=>!selected.some/);assert.match(ui,/scanned&&<section className=\{styles.health\}/);
 assert.match(studio,/!productionSocial&&tab==="metrics"/);
});

test("inbox reads only verified profile conversations and comments, never arbitrary object IDs or writes",async()=>{
 const seen=[];
 const fetcher=async(url,opts)=>{
  const u=new URL(url);seen.push(u.pathname);assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
  if(u.pathname.endsWith("/me/accounts"))return new Response(JSON.stringify({data:[{id:accountId,access_token:pageToken}]}));
  assert.equal(opts.headers.Authorization,"Bearer "+pageToken);
  if(u.pathname.endsWith("/conversations"))return new Response(JSON.stringify({data:[{id:"t_123",updated_time:"2026-11-20T00:00:00Z",participants:{data:[{id:accountId,name:"Owner"},{id:"12345",name:"Test customer"}]}}]}));
  if(u.pathname.endsWith("/t_123/messages"))return new Response(JSON.stringify({data:[{id:"m_123",message:"Synthetic message",created_time:"2026-11-20T00:00:00Z",from:{id:accountId,name:"Owner"}}],paging:{next:"secret-url"}}));
  if(u.pathname.endsWith("/published_posts"))return new Response(JSON.stringify({data:[{id:accountId+"_123",message:"Synthetic post",comments:{summary:{total_count:2}}}]}));
  if(u.pathname.endsWith("/"+accountId+"_123/comments"))return new Response(JSON.stringify({data:[{id:"123_456",message:"Synthetic comment",from:{name:"Test author"}}]}));
  throw Error("Unexpected route "+u.pathname);
 };
 const common={mode:"facebook",accountId,version:"v27.0",token:userToken,appSecret:secret,fetcher};
 const inbox={...common,channel:"messages",grantedPermissions:[...analytics.FACEBOOK_INBOX_READ_SCOPES]};
 assert.equal((await analytics.fetchMetaInbox(inbox)).rows[0].title,"Test customer");
 const thread=await analytics.fetchMetaInbox({...inbox,parentId:"t_123"});
 assert.equal(thread.rows[0].direction,"outgoing");assert.equal(thread.rows[0].body,"Synthetic message");
 assert.doesNotMatch(JSON.stringify(thread),/secret-url|fb-page-synthetic-token/);
 await assert.rejects(()=>analytics.fetchMetaInbox({...inbox,parentId:"t_999"}),/not in the connected profile/);
 await assert.rejects(()=>analytics.fetchMetaInbox({...inbox,parentId:"../me"}),/Invalid inbox selection/);
 const comments={...common,channel:"comments",grantedPermissions:["pages_show_list","pages_read_engagement"]};
 assert.equal((await analytics.fetchMetaInbox(comments)).rows[0].count,2);
 assert.equal((await analytics.fetchMetaInbox({...comments,parentId:accountId+"_123"})).rows[0].body,"Synthetic comment");
 await assert.rejects(()=>analytics.fetchMetaInbox({...comments,grantedPermissions:[]}),/Missing inbox permissions/);
 assert.ok(!seen.some(x=>x.includes("t_999")));
 const route=read("app/api/platform/social/meta/inbox/route.ts"),ui=read("app/meta-inbox-panel.tsx"),studio=read("app/social-studio.tsx");
 assert.match(route,/connectionGate\(req\)/);assert.match(route,/inspectMetaToken/);assert.match(route,/publishingEnabled:false/);
 assert.doesNotMatch(route,/export async function (POST|PATCH|DELETE)/);
 assert.match(ui,/snapshot.accountId!==account.accountId/);assert.match(ui,/local session only/);
 assert.match(studio,/\["comments","Comments"\]/);
});

test("Instagram direct inbox reads only the most recent 20 message IDs from the selected conversation",async()=>{
 const seen=[];
 const fetcher=async(url,opts)=>{
  const u=new URL(url);seen.push(u.pathname);assert.equal(u.origin,"https://graph.instagram.com");assert.equal(opts.method,"GET");
  if(u.pathname.endsWith("/conversations"))return new Response(JSON.stringify({data:[{id:"ig_thread_1"}]}));
  if(u.pathname.endsWith("/ig_thread_1")){assert.equal(u.searchParams.get("fields"),"messages");return new Response(JSON.stringify({id:"ig_thread_1",messages:{data:Array.from({length:23},(_,i)=>({id:"ig_message_"+i}))}}));}
  const id=u.pathname.split("/").pop();
  if(id==="ig_message_0")return new Response(JSON.stringify({id:"wrong_id",message:"wrong identity"}));
  return new Response(JSON.stringify({id,message:"Synthetic text",from:{username:"test_customer",id:"111111111111"}}));
 };
 const input={mode:"instagram_direct",accountId,version:"v27.0",token:userToken,appSecret:secret,channel:"messages",grantedPermissions:["instagram_business_basic","instagram_business_manage_messages"],parentId:"ig_thread_1",fetcher};
 const result=await analytics.fetchMetaInbox(input);
 assert.equal(result.rows.length,20);assert.equal(result.moreAvailable,true);
 assert.equal(result.rows[0].body,null);assert.equal(result.rows[1].body,"Synthetic text");
 assert.equal(seen.length,22);assert.ok(!seen.some(x=>x.endsWith("/ig_message_20")));
 await assert.rejects(()=>analytics.fetchMetaInbox({...input,parentId:"ig_other"}),/not in the connected profile/);
});

const infra=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-infrastructure.ts"))).toString("base64"));
test("infrastructure DNS only accepts public hostnames and exact ownership challenge",async()=>{
 assert.equal(infra.normalizeDomain(" Example.COM. "),"example.com");
 for(const input of ["http://example.com","a.com/path","a.com:443","127.0.0.1","a.local","a.internal","localhost","bad..com","-bad.com","a.com?x=1"])assert.equal(infra.normalizeDomain(input),null);
 assert.equal(infra.safeCount("0"),0);assert.equal(infra.safeCount(null),null);assert.equal(infra.safeCount("-1"),null);
 const id="12345678-1234-1234-1234-123456789012";
 const missing=async()=>{throw Object.assign(Error("missing"),{code:"ENODATA"});};
 const resolver={resolve4:async h=>{assert.equal(h,"example.com");return ["192.0.2.10"];},resolve6:missing,resolveCname:missing,resolveMx:missing,resolveNs:missing,resolveTxt:async h=>{assert.equal(h,"_reach-verification.example.com");return [["reach-verification=",id]];}};
 const result=await infra.domainDns("example.com",id,resolver);
 assert.equal(result.ownership,"verified");assert.equal(result.ssl,"not_checked");assert.equal(result.records.aaaa.status,"not_found");
 assert.equal((await infra.domainDns("example.com",id,{...resolver,resolveTxt:async()=>[["different"]]})).ownership,"not_verified");
 await assert.rejects(()=>infra.domainDns("127.0.0.1",id,resolver),/Invalid domain/);
});

test("domain intelligence distinguishes observed DNS from unavailable checks and limits mail policy findings",async()=>{
 const id="12345678-1234-1234-1234-123456789012",missing=async()=>{throw Object.assign(Error("missing"),{code:"ENODATA"});};
 const resolver={resolve4:async h=>h==="example.com"?["192.0.2.10"]:[],resolve6:missing,resolveCname:missing,resolveMx:async()=>[{exchange:"mail.example.com",priority:10}],resolveNs:async()=>["ns.example.com"],resolveCaa:missing,resolveSoa:missing,resolveTxt:async h=>h.startsWith("_reach-verification.")?[["reach-verification="+id]]:h.startsWith("_dmarc.")?[["v=DMARC1; p=none"]]:[["v=spf1 -all"],["v=spf1 ~all"],["unrelated-verification-secret"]]};
 const result=await infra.domainIntelligence("example.com",id,resolver);
 assert.equal(result.ownership,"verified");assert.equal(result.mail.spf.length,2);assert.equal(result.mail.dmarc.policy,"none");
 assert.equal(result.checks.find(c=>c.name==="SPF").status,"attention");assert.equal(result.checks.find(c=>c.name==="DMARC").status,"attention");
 assert.equal(result.limits.ssl,"not_checked");assert.doesNotMatch(JSON.stringify(result),/unrelated-verification-secret/);
 const failed=async()=>{throw Object.assign(Error("timeout"),{code:"ETIMEOUT"});};
 const noData=await infra.domainIntelligence("example.com",id,{...resolver,resolve4:failed,resolve6:failed,resolveCname:failed,resolveTxt:failed});
 assert.equal(noData.checks.find(c=>c.name==="Website DNS").status,"unknown");assert.equal(noData.checks.find(c=>c.name==="SPF").status,"unknown");
});

const infraUri="data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-infrastructure.ts"))).toString("base64");
const website=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-web-analytics.ts").replace('"./reach-infrastructure"',JSON.stringify(infraUri)))).toString("base64"));
test("website public ranking stays separate from unavailable measured demographics",async()=>{
 const fetcher=async(url,opts)=>{assert.equal(url,"https://tranco-list.eu/api/ranks/domain/example.com");assert.equal(opts.redirect,"error");return new Response(JSON.stringify({domain:"example.com",ranks:[{date:"2026-11-26",rank:420},{date:"2026-11-25",rank:500},{date:"bad",rank:1}]}));};
 const result=await website.websiteAnalytics("example.com",28,{},fetcher);
 assert.equal(result.public.rank,420);assert.equal(result.public.history.length,2);assert.equal(result.measured.status,"not_configured");assert.deepEqual(result.measured.reports,[]);
 assert.equal((await website.publicRank("example.com",async()=>new Response(JSON.stringify({ranks:[]})))).status,"not_ranked");
 assert.equal((await website.publicRank("example.com",async()=>new Response("",{status:429}))).status,"unavailable");
 await assert.rejects(()=>website.websiteAnalytics("127.0.0.1",28,{},fetcher),/Invalid report/);
});
test("website GA4 reports use exact hostname and privacy thresholding, not inferred demographics",()=>{
 const age=website.REPORTS.find(s=>s.id==="age"),outbound=website.REPORTS.find(s=>s.id==="outbound");
 const filter=website.gaRequest("example.com",28,outbound);
 assert.equal(filter.dimensionFilter.andGroup.expressions[0].filter.stringFilter.value,"example.com");
 assert.equal(filter.dimensionFilter.andGroup.expressions[1].filter.stringFilter.value,"click");
 assert.equal(filter.dimensionFilter.andGroup.expressions[2].filter.stringFilter.value,"true");
 const data={dimensionHeaders:[{name:"userAgeBracket"}],metricHeaders:[{name:"activeUsers"}],rows:[{dimensionValues:[{value:"25-34"}],metricValues:[{value:"5"}]}],rowCount:1,metadata:{subjectToThresholding:true}};
 assert.deepEqual(website.parseGaReport(data,age).rows,[]);
 assert.equal(website.parseGaReport(data,age).status,"thresholded");
 assert.equal(website.parseGaReport({...data,metadata:{}},age).rows[0].values[0],5);
 assert.throws(()=>website.parseGaReport({...data,metricHeaders:[{name:"wrong"}]},age),/Unexpected report schema/);
 const route=read("app/api/reach/website-analytics/route.ts"),ui=read("app/website-analytics-panel.tsx");
 assert.match(route,/connectionGate\(req\)/);assert.match(route,/WHERE workspace_id=\$1::uuid AND id=\$2::uuid/);assert.doesNotMatch(route,/export async function (POST|DELETE|PATCH)/);
 assert.match(ui,/report.hostname!==selected.hostname/);assert.match(ui,/not visits or demographics/);
});

const websiteUri="data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-web-analytics.ts").replace('"./reach-infrastructure"',JSON.stringify(infraUri)))).toString("base64");
const seo=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-web-seo.ts").replace('"./reach-infrastructure"',JSON.stringify(infraUri)).replace('"./reach-web-analytics"',JSON.stringify(websiteUri)))).toString("base64"));
test("SEO scan uses fixed Google endpoint and distinguishes missing scores and redirects",async()=>{
 const fixture={lighthouseResult:{finalDisplayedUrl:"https://example.com/",categories:{seo:{score:0.92},performance:{score:0},accessibility:{score:null}},audits:{"document-title":{title:"Document title",score:1,scoreDisplayMode:"binary"},"meta-description":{title:"Meta description",score:0,scoreDisplayMode:"binary"},"unrelated":{title:"Ignored"}}},loadingExperience:{id:"https://example.com/",metrics:{LARGEST_CONTENTFUL_PAINT_MS:{percentile:2400,category:"FAST"}}}};
 const fetcher=async(url,opts)=>{const u=new URL(url);assert.equal(u.origin,"https://www.googleapis.com");assert.equal(u.pathname,"/pagespeedonline/v5/runPagespeed");assert.equal(u.searchParams.get("url"),"https://example.com/");assert.equal(u.searchParams.get("strategy"),"mobile");assert.deepEqual(u.searchParams.getAll("category"),["performance","seo","accessibility","best-practices"]);assert.equal(opts.redirect,"error");return new Response(JSON.stringify(fixture));};
 const result=await seo.websiteSeo("example.com",28,"mobile",{},fetcher);
 assert.equal(result.technical.scores.find(x=>x.id==="seo").score,92);
 assert.equal(result.technical.scores.find(x=>x.id==="performance").score,0);
 assert.equal(result.technical.scores.find(x=>x.id==="accessibility").score,null);
 assert.equal(result.technical.audits.length,2);assert.equal(result.technical.field[0].percentile,2400);
 assert.equal(result.search.status,"not_configured");
 assert.equal(seo.parsePageSpeed({...fixture,lighthouseResult:{...fixture.lighthouseResult,finalDisplayedUrl:"https://other.com/"}}, "example.com").status,"redirected");
 assert.equal(seo.parsePageSpeed({...fixture,loadingExperience:{...fixture.loadingExperience,origin_fallback:true}},"example.com").field.length,0);
 assert.equal((await seo.pageSpeed("example.com","mobile",{},async()=>new Response("",{status:429}))).status,"unavailable");
 await assert.rejects(()=>seo.websiteSeo("127.0.0.1",28,"mobile",{},fetcher),/Invalid SEO scan/);
});
test("Search Console requires exact HTTPS property and preserves search metrics without fabricating data",async()=>{
 const result=await seo.searchConsole("example.com",28,{REACH_WEB_SEO_PROPERTIES:JSON.stringify({"example.com":"sc-domain:example.com"}),REACH_WEB_SEO_SERVICE_ACCOUNT:"{}"},async()=>{throw Error("Must not call");});
 assert.equal(result.status,"not_configured");
 const request=seo.searchRequest("date",7,Date.parse("2026-11-27T12:00:00Z"));
 assert.equal(request.startDate,"2026-11-18");assert.equal(request.endDate,"2026-11-24");assert.equal(request.dataState,"final");
 const parsed=seo.parseSearch({rows:[{keys:["https://example.com/a"],clicks:0,impressions:30,ctr:0,position:5.2},{keys:["https://other.com/"],clicks:99}]},"page","example.com");
 assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].clicks,0);assert.equal(parsed.rows[0].position,5.2);
 assert.equal(seo.parseSearch({rows:[]},"query","example.com").status,"no_rows");
});

const seoUri="data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-web-seo.ts").replace('"./reach-infrastructure"',JSON.stringify(infraUri)).replace('"./reach-web-analytics"',JSON.stringify(websiteUri)))).toString("base64");
const verifyProvider=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-integration-verification.ts").replace('"./reach-infrastructure"',JSON.stringify(infraUri)).replace('"./reach-web-analytics"',JSON.stringify(websiteUri)).replace('"./reach-web-seo"',JSON.stringify(seoUri)))).toString("base64"));
test("expanded provider setup cards distinguish working verification from setup guides",()=>{
 const catalog=read("lib/reach-integration-catalog.ts"),ui=read("app/connections/provider-setup-cards.tsx"),page=read("app/connections/page.tsx"),route=read("app/api/reach/integrations/route.ts");
 assert.match(page,/<ProviderSetupCards/);assert.match(page,/<InfrastructureCards/);
 assert.match(catalog,/name:"Google Analytics 4"/);assert.match(catalog,/name:"Shopify"/);assert.match(catalog,/name:"Google Business Profile"/);
 assert.match(ui,/Setup guide only/);assert.match(ui,/Input fields here are session-only/);
 assert.match(route,/connectionGate\(req,true\)/);assert.match(route,/WHERE workspace_id=\$1::uuid AND id=\$2::uuid/);
 assert.doesNotMatch(route,/INSERT INTO|UPDATE public|DELETE FROM/);
 assert.equal(verifyProvider.configured("search_console","example.com",{REACH_WEB_SEO_PROPERTIES:'{"example.com":"sc-domain:example.com"}',REACH_WEB_SEO_SERVICE_ACCOUNT:"{}"}),false);
 assert.equal(verifyProvider.configured("ga4","example.com",{REACH_WEB_ANALYTICS_PROPERTIES:'{"example.com":"123"}',REACH_WEB_ANALYTICS_SERVICE_ACCOUNT:"{}"}),true);
});
test("Shopify connection verification requires exact store, installed read scopes and no write access",async()=>{
 const env={REACH_SHOPIFY_SHOP:"demo-shop.myshopify.com",REACH_SHOPIFY_CLIENT_ID:"synthetic-id",REACH_SHOPIFY_CLIENT_SECRET:"synthetic-secret"};
 for(const bad of ["https://demo.myshopify.com","demo.myshopify.com.evil.org","demo.myshopify.com/path","127.0.0.1"])assert.equal(verifyProvider.validShop(bad),false);
 let calls=0;
 const fetcher=(scopes,shop=env.REACH_SHOPIFY_SHOP)=>async(url,opts)=>{
  calls++;const u=new URL(url);assert.equal(u.origin,"https://demo-shop.myshopify.com");assert.equal(opts.redirect,"error");
  if(u.pathname==="/admin/oauth/access_token"){assert.equal(opts.body.get("grant_type"),"client_credentials");return new Response(JSON.stringify({access_token:"synthetic-token"}));}
  assert.equal(u.pathname,"/admin/api/2026-10/graphql.json");assert.equal(opts.headers["X-Shopify-Access-Token"],"synthetic-token");assert.doesNotMatch(opts.body,/mutation/);
  return new Response(JSON.stringify({data:{shop:{myshopifyDomain:shop},currentAppInstallation:{accessScopes:scopes.map(handle=>({handle}))}}}));
 };
 const proof=await verifyProvider.verifyIntegration("shopify",null,env,fetcher(["read_products","read_inventory"]));
 assert.equal(proof.status,"verified");assert.equal(calls,2);assert.doesNotMatch(JSON.stringify(proof),/synthetic-token|synthetic-secret/);
 assert.equal((await verifyProvider.verifyIntegration("shopify",null,env,fetcher(["read_products","read_inventory","write_products"]))).status,"attention");
 assert.equal((await verifyProvider.verifyIntegration("shopify",null,env,fetcher(["read_products"]))).status,"attention");
 assert.equal((await verifyProvider.verifyIntegration("shopify",null,env,fetcher(["read_products","read_inventory"],"wrong.myshopify.com"))).status,"unavailable");
 assert.equal((await verifyProvider.verifyIntegration("shopify",null,{},async()=>{throw Error("Must not call");})).status,"setup_required");
});

const googleContractUri="data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-google-contract.ts"))).toString("base64");
const googleContract=await import(googleContractUri);
const googleDiagnosticsUri="data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-google-diagnostics.ts"))).toString("base64");
const googleDiagnostics=await import(googleDiagnosticsUri);
const googleOAuth=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-google-oauth.ts").replace('"./reach-google-diagnostics"',JSON.stringify(googleDiagnosticsUri)).replace('"./reach-google-contract"',JSON.stringify(googleContractUri)).replace('"./reach-infrastructure"',JSON.stringify(infraUri)))).toString("base64"));
test("Google incremental consent uses PKCE, offline read-only scopes and canonical callback",()=>{
 const u=new URL(googleContract.authorizeGoogle("synthetic.apps.googleusercontent.com","ga4","state","challenge"));
 assert.equal(u.origin,"https://accounts.google.com");assert.equal(u.searchParams.get("redirect_uri"),googleContract.GOOGLE_CALLBACK);
 assert.equal(u.searchParams.get("include_granted_scopes"),"true");assert.equal(u.searchParams.get("code_challenge_method"),"S256");assert.equal(u.searchParams.get("access_type"),"offline");
 const scopes=u.searchParams.get("scope");assert.ok(googleContract.googleGrant(scopes,"ga4"));assert.equal(googleContract.googleGrant(scopes,"search_console"),null);
 assert.equal(googleContract.googleGrant(scopes+" https://www.googleapis.com/auth/analytics.edit","ga4"),null);
 const env={REACH_GOOGLE_TOKEN_KEY:Buffer.alloc(32,7).toString("base64url")};
 const sealed=googleOAuth.sealGoogle("synthetic-refresh","workspace:pending:123",env);
 assert.doesNotMatch(sealed,/synthetic-refresh/);assert.equal(googleOAuth.openGoogle(sealed,"workspace:pending:123",env),"synthetic-refresh");
 assert.throws(()=>googleOAuth.openGoogle(sealed,"another-workspace:pending:123",env));
 assert.throws(()=>googleOAuth.openGoogle(sealed,"workspace:connection:123",env));
});
test("Google exchange and property discovery reject unverified identity and unrelated sites",async()=>{
 const scopes=[...googleContract.IDENTITY_SCOPES,...googleContract.groupFor("ga4").scopes].join(" ");
 const env={REACH_GOOGLE_CLIENT_ID:"synthetic.apps.googleusercontent.com",REACH_GOOGLE_CLIENT_SECRET:"synthetic-secret"};
 const mock=async(url,opts)=>{const u=new URL(url);assert.equal(opts.redirect,"error");
 if(u.hostname==="oauth2.googleapis.com"){assert.equal(opts.body.get("code_verifier"),"a".repeat(43));return new Response(JSON.stringify({access_token:"synthetic-access",refresh_token:"synthetic-refresh",scope:scopes,token_type:"Bearer"}));}
 if(u.hostname==="openidconnect.googleapis.com")return new Response(JSON.stringify({sub:"123456",email:"owner@example.com",email_verified:true}));
 if(u.pathname==="/v1beta/accountSummaries")return new Response(JSON.stringify({accountSummaries:[{propertySummaries:[{property:"properties/123",displayName:"Matched"},{property:"properties/456",displayName:"Other"}]}]}));
 return new Response(JSON.stringify({dataStreams:[{webStreamData:{defaultUri:u.pathname.includes("/123/")?"https://example.com/":"https://other.com/"}}]}));
 };
 const grant=await googleOAuth.exchangeGoogle("synthetic-code","a".repeat(43),"ga4",env,mock);
 assert.equal(grant.subject,"123456");assert.equal(grant.refresh,"synthetic-refresh");
 assert.deepEqual(await googleOAuth.discoverGoogle("ga4",grant.access,grant.subject,"example.com",mock),[{id:"properties/123",name:"Matched"}]);
 await assert.rejects(()=>googleOAuth.exchangeGoogle("synthetic-code","a".repeat(43),"search_console",env,mock),/grant/);
 const sites=await googleOAuth.discoverGoogle("search_console","token","123456","example.com",async()=>new Response(JSON.stringify({siteEntry:[{siteUrl:"https://example.com/",permissionLevel:"siteFullUser"},{siteUrl:"sc-domain:example.com",permissionLevel:"siteOwner"},{siteUrl:"https://other.com/",permissionLevel:"siteOwner"}]})));
 assert.deepEqual(sites,[{id:"https://example.com/",name:"https://example.com/"}]);
});
test("Google authorization keeps one-time flows, workspace checks and explicit resource selection",()=>{
 const store=read("lib/reach-google-store.ts"),route=read("app/api/reach/google/route.ts"),callback=read("app/api/reach/google/callback/route.ts"),migration=read("migrations/003-google-oauth.sql");
 assert.match(route,/connectionGate\(req,true\)/);assert.match(route,/b.confirm!==true/);assert.match(callback,/consumeGoogleFlow/);
 assert.match(store,/DELETE FROM public.reach_google_flows WHERE workspace_id=\$1::uuid AND state_hash=\$2 AND browser_hash=\$3/);
 assert.match(store,/candidates.find\(c=>c.id===resourceId\)/);assert.match(store,/WITH claimed AS \(DELETE FROM public.reach_google_pending/);
 assert.equal((migration.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,3);
 assert.match(migration,/reach_google_one_site_mapping/);
 assert.match(read("app/api/reach/website-analytics/route.ts"),/googleSiteAccess/);
 assert.match(read("app/api/reach/website-seo/route.ts"),/googleSiteAccess/);
});

const googleDeveloper=await import("data:text/javascript;base64,"+Buffer.from(transpile(read("lib/reach-google-developer-contract.ts").replace('"./reach-google-contract"',JSON.stringify(googleContractUri)))).toString("base64"));
test("Google developer setup accepts exact Web OAuth credentials and rejects incorrect import types and callback",()=>{
 const fixture={web:{project_id:"reach-example",client_id:"synthetic-example.apps.googleusercontent.com",client_secret:"GOCSPX-synthetic-secret",redirect_uris:[googleContract.GOOGLE_CALLBACK],auth_uri:"https://evil.example/auth"}};
 const v=googleDeveloper.parseGoogleWebClient(JSON.stringify(fixture));
 assert.deepEqual(v,{projectId:"reach-example",clientId:"synthetic-example.apps.googleusercontent.com",clientSecret:"GOCSPX-synthetic-secret"});
 assert.equal(Object.hasOwn(v,"auth_uri"),false);
 assert.throws(()=>googleDeveloper.parseGoogleWebClient(JSON.stringify({installed:fixture.web})));
 assert.throws(()=>googleDeveloper.parseGoogleWebClient(JSON.stringify({type:"service_account",private_key:"synthetic"})));
 assert.throws(()=>googleDeveloper.parseGoogleWebClient(JSON.stringify({web:{...fixture.web,redirect_uris:["https://evil.example/callback"]}})));
 assert.throws(()=>googleDeveloper.validateGoogleDeveloper({...v,projectId:"NOT VALID"}));
});
test("developer app stays server encrypted, owner scoped, activation gated and preserves existing grants",()=>{
 const store=read("lib/reach-google-developer-store.ts"),route=read("app/api/reach/google/developer/route.ts"),googleStore=read("lib/reach-google-store.ts"),ui=read("app/connections/google-developer-panel.tsx"),schema=read("migrations/004-google-developer-config.sql");
 assert.match(store,/hkdfSync/);assert.match(store,/randomBytes\(32\)/);assert.match(store,/sealGoogle\(JSON.stringify/);
 assert.match(store,/old.client_id!==v.clientId/);assert.match(store,/old\?\.enabled/);assert.match(store,/REACH_GOOGLE_OAUTH_ENABLED!=="true"/);
 assert.match(route,/connectionGate\(req,true\)/);assert.match(route,/b.confirm!==true/);
 assert.match(schema,/FORCE ROW LEVEL SECURITY/);assert.match(schema,/FROM PUBLIC,reach_app_runtime/);
 assert.match(ui,/type="password"/);assert.match(ui,/setSecret\(""\)/);assert.doesNotMatch(ui,/localStorage|sessionStorage/);
 assert.match(googleStore,/g.scopes.every\(scope=>r.scopes.includes\(scope\)\)/);assert.match(googleStore,/await refreshGoogle\(refresh,group,r.subject,env\)/);
 assert.match(read("app/api/reach/google/callback/route.ts"),/resolvedGoogleEnv\(w\)/);
 assert.match(read("app/api/reach/google/route.ts"),/b.action==="reuse"/);
});

test("Google diagnostics accept only canonical routed host and reject hostile or conflicting headers",()=>{
 const host="agency-control-gateway.vercel.app",origin="https://"+host,internal="https://internal-preview.vercel.app";
 assert.equal(googleDiagnostics.canonicalGoogleRequest(origin,host,host,"https","production"),true);
 assert.equal(googleDiagnostics.canonicalGoogleRequest(internal,host,host,"https","production"),true);
 assert.equal(googleDiagnostics.canonicalGoogleRequest(internal,host,host,"http","production"),false);
 assert.equal(googleDiagnostics.canonicalGoogleRequest(origin,host,"evil.example","https","production"),false);
 assert.equal(googleDiagnostics.canonicalGoogleRequest(origin,"evil.example",host,"https","production"),false);
 assert.equal(googleDiagnostics.canonicalGoogleRequest(origin,null,null,"https","production"),false);
 assert.equal(googleDiagnostics.canonicalGoogleRequest(origin,host,host,"https","preview"),false);
});
test("Google callback distinguishes expired, mismatched and unknown flow without exposing hashes",()=>{
 const valid={expired:false,browserMatches:true,clientMatches:true};
 assert.equal(googleDiagnostics.flowFailure(null),"state_unknown");
 assert.equal(googleDiagnostics.flowFailure({...valid,expired:true}),"state_expired");
 assert.equal(googleDiagnostics.flowFailure({...valid,browserMatches:false}),"cookie_mismatch");
 assert.equal(googleDiagnostics.flowFailure({...valid,clientMatches:false}),"client_changed");
 assert.equal(googleDiagnostics.validGoogleNonce("a".repeat(43)),true);
 assert.equal(googleDiagnostics.validGoogleNonce("a".repeat(44)),false);
 assert.equal(googleDiagnostics.diagnosticCode("private-token"),null);
 assert.equal(googleDiagnostics.safeDiagnostic(Error("private-token"),"token_unavailable"),"token_unavailable");
 const route=read("app/api/reach/google/route.ts"),callback=read("app/api/reach/google/callback/route.ts"),store=read("lib/reach-google-store.ts");
 assert.ok(route.includes('response.cookies.set("reach_google_browser_"+digest(state)'));
 assert.ok(callback.includes('const name="reach_google_browser_"+digest(state)'));
 assert.ok(route.includes("maxAge:GOOGLE_FLOW_SECONDS"));
 assert.ok(store.includes("clientHash(env),GOOGLE_FLOW_SECONDS"));
 assert.ok(callback.includes('console.info("reach_google_callback",code)'));
 assert.ok(callback.includes('if(cookieName)r.cookies.set(cookieName'));
 assert.ok(callback.includes('req.nextUrl.searchParams.getAll("state").length!==1'));
 assert.ok(callback.includes('req.nextUrl.searchParams.getAll("code").length!==1'));
 assert.ok(callback.includes('safeDiagnostic(e,stage)'));
 assert.ok(callback.indexOf("await consumeGoogleFlow")<callback.indexOf("await exchangeGoogle"));
 assert.notEqual(googleOAuth.digest("a".repeat(43)),googleOAuth.digest("b".repeat(43)));
});
test("Google token response diagnostic codes never expose raw provider messages or secrets",async()=>{
 const env={REACH_GOOGLE_CLIENT_ID:"synthetic.apps.googleusercontent.com",REACH_GOOGLE_CLIENT_SECRET:"synthetic-secret"};
 for(const code of ["invalid_client","invalid_grant","redirect_uri_mismatch","invalid_scope","unauthorized_client","arbitrary-provider-text"]){
 const want=code==="arbitrary-provider-text"?"token_unavailable":code;
 await assert.rejects(()=>googleOAuth.exchangeGoogle("synthetic-code","a".repeat(43),"ga4",env,async()=>new Response(JSON.stringify({error:code,error_description:"sensitive-provider-details"}),{status:400})),e=>e.code===want&&!e.message.includes("sensitive-provider-details"));
 }
 const scopes=[...googleContract.IDENTITY_SCOPES,...googleContract.groupFor("ga4").scopes].join(" ");
 await assert.rejects(()=>googleOAuth.exchangeGoogle("synthetic-code","a".repeat(43),"ga4",env,async()=>new Response(JSON.stringify({scope:scopes,access_token:"synthetic-access",token_type:"Bearer"}))),e=>e.code==="offline_missing");
 assert.equal(googleDiagnostics.providerDiagnostic("access_denied"),"consent_denied");
 assert.equal(googleDiagnostics.providerDiagnostic("admin_policy_enforced"),"access_blocked");
});
