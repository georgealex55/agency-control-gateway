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
