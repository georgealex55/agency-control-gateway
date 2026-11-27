import {appSecretProof,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {validGraphVersion} from "@/lib/social-meta-contract";
type Obj=Record<string,unknown>;
const object=(v:unknown):Obj|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Obj:null;
const nonnegative=(v:unknown):number|null=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:null;
const text=(v:unknown,limit:number):string|null=>typeof v==="string"&&v.length<=limit?v:null;
const idValid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9]{2,40}$/.test(v);
const postIdValid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9]{2,40}(?:_[0-9]{2,40})?$/.test(v);
const countSummary=(v:unknown):number|null=>nonnegative(object(object(v)?.summary)?.total_count);
export type MetaPostMetric={id:string;createdAt:string|null;caption:string|null;
 likes:number|null;comments:number|null;shares:number|null;link:string|null;
 format:string|null;previewImages:string[];views:number|null;uniqueViewers:number|null;reach:number|null;saves:number|null;interactions:number|null;insightsStatus:"not_requested"|"available"|"partial"|"unavailable"};
export type MetaAnalyticsSnapshot={
 source:"meta_graph_api";accountId:string;accountName:string|null;checkedAt:string;
 followers:number|null;totalPosts:number|null;recentPosts:MetaPostMetric[];
 recentLikes:number|null;recentComments:number|null;
 reach:number|null;reachStatus:"not_requested"|"unavailable"|"available";
 partial:boolean;period:"recent_10_posts"|"recent_25_posts"|"recent_50_posts";liveProviderRead:true;
 requestedPosts:number;detailCoverage:number;recentShares:number|null;
 accountInsights?:{period:string;status:"available"|"partial"|"unavailable";metrics:{name:string;value:number;endAt:string|null}[]};
};
async function graphGet(input:{mode:MetaLoginMode;version:string;token:string;appSecret:string;
 path:string;params:Record<string,string>;fetcher:typeof fetch}):Promise<Obj>{
 const host=input.mode==="instagram_direct"?"graph.instagram.com":"graph.facebook.com";
 const u=new URL("https://"+host+"/"+input.version+"/"+input.path);
 for(const [k,v] of Object.entries(input.params))u.searchParams.set(k,v);
 // App Secret Proof enables server-side calls when Meta requires proof;
 // it cannot be reversed to reveal an app secret or an access token.
 u.searchParams.set("appsecret_proof",appSecretProof(input.token,input.appSecret));
 const res=await input.fetcher(u.href,{method:"GET",redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(8500),headers:{Authorization:"Bearer "+input.token,Accept:"application/json"}});
 if(!res.ok)throw Error("Meta denied the read-only request");
 const body:unknown=await res.json();
 const v=object(body);if(!v)throw Error("Malformed Meta analytics response");
 return v;
}
async function facebookPageToken(input:{version:string;token:string;appSecret:string;accountId:string;fetcher:typeof fetch}):Promise<string>{
 const result=await graphGet({...input,mode:"facebook",path:"me/accounts",
  params:{fields:"id,name,tasks,access_token",limit:"100"}});
 if(!Array.isArray(result.data))throw Error("Meta Page list is unavailable");
 const page=result.data.map(object).find(p=>p?.id===input.accountId);
 const token=page?.access_token;
 if(typeof token!=="string"||token.length<10||token.length>4096)throw Error("Selected Page access token not available");
 // Never return this token to browser or persist it in analytics output.
 return token;
}
/** A real account data snapshot. Null means Meta did not provide that metric;
 * do not infer reach, views, impressions or engagement rates.
 */
export async function fetchMetaAnalytics(input:{mode:MetaLoginMode;accountId:string;version:string;
 token:string;appSecret:string;grantedPermissions:string[];fetcher?:typeof fetch;postLimit?:number;detailed?:boolean;accountDetails?:boolean
}):Promise<MetaAnalyticsSnapshot>{
 if(!idValid(input.accountId)||!validGraphVersion(input.version)||typeof input.token!=="string"||
  input.token.length<10||input.token.length>4096||input.appSecret.length<8||input.appSecret.length>1024)
  throw Error("Invalid Meta analytics connection");
 const fetcher=input.fetcher||fetch;
 const facebook=input.mode==="facebook";
 let token=input.token;
 if(facebook)token=await facebookPageToken({version:input.version,token,appSecret:input.appSecret,accountId:input.accountId,fetcher});
 const mode=input.mode;
 const postLimit=input.postLimit===25?25:input.postLimit===50?50:10;
 const detailed=input.detailed===true;
 const params=facebook?{fields:"id,name,followers_count,fan_count"}:
   {fields:"id,username,followers_count,media_count"};
 const profile=await graphGet({mode,version:input.version,token,appSecret:input.appSecret,
  path:input.accountId,params,fetcher});
 if(profile.id!==input.accountId)throw Error("Meta returned a different account identity");
 const postPath=input.accountId+(facebook?"/published_posts":"/media");
 const baseFields=facebook?"id,created_time,message,permalink_url,comments.summary(true),reactions.summary(true),shares":
  "id,timestamp,caption,permalink,media_type,like_count,comments_count";
 const formatFields=facebook?",attachments{media_type,type}":",media_product_type";
 const previewFields=facebook?",attachments{media_type,type,media,subattachments{media_type,type,media}}":",media_product_type,media_url,thumbnail_url,children{media_type,media_url,thumbnail_url}";
 const postParams={fields:baseFields+(detailed?previewFields:""),limit:String(postLimit)};
 let postRecords:MetaPostMetric[]=[],partial=false;
 try{
  const args={mode,version:input.version,token,appSecret:input.appSecret,path:postPath,fetcher};
  let body:Obj;
  try{body=await graphGet({...args,params:postParams});}
  catch(e){
   if(!detailed)throw e;partial=true;
   try{body=await graphGet({...args,params:{fields:baseFields+formatFields,limit:String(postLimit)}});}
   catch{body=await graphGet({...args,params:{fields:baseFields,limit:String(postLimit)}});}
  }
  if(!Array.isArray(body.data)||body.data.length>postLimit)throw Error("Invalid recent post data");
  postRecords=body.data.map((raw):MetaPostMetric=>{
   const o=object(raw);if(!o||!postIdValid(o.id))throw Error("Invalid provider post");
   return{id:o.id,createdAt:text(facebook?o.created_time:o.timestamp,64),
    caption:typeof (facebook?o.message:o.caption)==="string"?String(facebook?o.message:o.caption).slice(0,20000):null,
    likes:facebook?countSummary(o.reactions):nonnegative(o.like_count),
    comments:facebook?countSummary(o.comments):nonnegative(o.comments_count),
    shares:facebook?nonnegative(object(o.shares)?.count):null,
    format:metaPostFormat(o,facebook),previewImages:postPreviewImages(o,facebook),
    views:null,uniqueViewers:null,reach:null,saves:null,interactions:null,insightsStatus:"not_requested",
    link:(()=>{
     const candidate=text(facebook?o.permalink_url:o.permalink,500);
     if(!candidate)return null;
     try{const url=new URL(candidate);return url.protocol==="https:"&&
      (url.hostname==="www.facebook.com"||url.hostname==="facebook.com"||url.hostname==="www.instagram.com"||url.hostname==="instagram.com")?url.href:null;
     }catch{return null;}
    })()};
  });
 }catch{partial=true;}
 // Keep deep insight requests bounded independently from the post list. Meta may
 // deny some metric combinations; preserve real basic data and mark missing values.
 const detailPosts=detailed?postRecords.slice(0,10):[];
 const canReadInsights=input.grantedPermissions.includes(facebook?"read_insights":mode==="instagram_direct"?"instagram_business_manage_insights":"instagram_manage_insights");
 const accountPromise=input.accountDetails?fetchAccountInsights({mode,version:input.version,token,appSecret:input.appSecret,accountId:input.accountId,fetcher},canReadInsights):Promise.resolve(undefined);
 for(let i=0;i<detailPosts.length;i+=5){
  await Promise.all(detailPosts.slice(i,i+5).map(async p=>{
   if(!canReadInsights){p.insightsStatus="unavailable";return;}
   const metrics=facebook?["post_media_view","post_total_media_view_unique"]:["views","reach","saved","shares","total_interactions"];
   try{
    const body=await graphGet({mode,version:input.version,token,appSecret:input.appSecret,path:p.id+"/insights",
     params:{metric:metrics.join(",")},fetcher});
    const values=readLifetimeInsights(body,metrics);
    p.views=values[facebook?"post_media_view":"views"]??null;
    if(facebook)p.uniqueViewers=values.post_total_media_view_unique??null;
    else {p.reach=values.reach??null;p.saves=values.saved??null;p.shares=values.shares??p.shares;p.interactions=values.total_interactions??null;}
    const count=Object.keys(values).length;
    p.insightsStatus=count===metrics.length?"available":count?"partial":"unavailable";
   }catch{p.insightsStatus="unavailable";}
  }));
 }
 if(detailPosts.some(p=>p.insightsStatus!=="available"))partial=true;
 const accountInsights=await accountPromise;
 const shares=postRecords.length&&postRecords.every(p=>p.shares!==null)?postRecords.reduce((a,p)=>a+(p.shares??0),0):null;
 const likes=postRecords.every(p=>p.likes!==null)&&postRecords.length?
  postRecords.reduce((a,p)=>a+(p.likes||0),0):null;
 const comments=postRecords.every(p=>p.comments!==null)&&postRecords.length?
  postRecords.reduce((a,p)=>a+(p.comments||0),0):null;
 // Account reach is a different metric from followers or post likes.
 // It is intentionally not estimated from those values.
 return {source:"meta_graph_api",accountId:input.accountId,
  accountName:text(facebook?profile.name:profile.username,150),
  checkedAt:new Date().toISOString(),
  followers:nonnegative(profile.followers_count)??(facebook?nonnegative(profile.fan_count):null),
  totalPosts:facebook?null:nonnegative(profile.media_count),
  recentPosts:postRecords,recentLikes:likes,recentComments:comments,
  reach:null,reachStatus:"not_requested",partial,period:postLimit===25?"recent_25_posts":postLimit===50?"recent_50_posts":"recent_10_posts",liveProviderRead:true,
  accountInsights,requestedPosts:postLimit,detailCoverage:detailPosts.filter(p=>p.insightsStatus==="available"||p.insightsStatus==="partial").length,recentShares:shares};
}

/** Normalize provider-specific values without guessing unknown formats. */
export function metaPostFormat(o:Obj,facebook:boolean):string|null{
 if(!facebook){
  if(o.media_product_type==="REELS")return "REEL";
  if(o.media_product_type==="STORY")return "STORY";
  const m=o.media_type;
  return m==="IMAGE"?"PHOTO":m==="CAROUSEL_ALBUM"?"CAROUSEL":m==="VIDEO"?"VIDEO":null;
 }
 const items=object(o.attachments)?.data;
 if(!Array.isArray(items))return null;
 if(items.length===0)return typeof o.message==="string"&&o.message.trim()?"TEXT":null;
 const a=object(items[0]),sub=object(a?.subattachments)?.data;
 if(items.length>1||Array.isArray(sub)&&sub.length>1)return "CAROUSEL";
 const type=String(a?.type??"").toLowerCase(),media=String(a?.media_type??"").toLowerCase();
 if(type==="album"||type==="multi_share")return "CAROUSEL";
 if(type==="reel"||type==="video_reel")return "REEL";
 if(type==="share"||type==="link"||media==="link")return "LINK";
 if(media==="video"||type.startsWith("video"))return "VIDEO";
 if(media==="photo"||media==="image"||type==="photo")return "PHOTO";
 return null;
}
/** Only allow Meta CDN image URLs. Never expose access tokens or fetch arbitrary URLs. */
export function safeMetaPreview(v:unknown):string|null{
 if(typeof v!=="string"||v.length>4096)return null;
 try{
  const u=new URL(v),host=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
   !["fbcdn.net","cdninstagram.com"].some(d=>host===d||host.endsWith("."+d)))return null;
  for(const key of u.searchParams.keys())if(/access.?token|appsecret|authorization|client.?secret/i.test(key))return null;
  return u.href;
 }catch{return null;}
}
export function postPreviewImages(o:Obj,facebook:boolean):string[]{
 const images:string[]=[];
 const add=(v:unknown)=>{const url=safeMetaPreview(v);if(url&&!images.includes(url)&&images.length<4)images.push(url);};
 if(facebook){
  const list=object(o.attachments)?.data;
  if(Array.isArray(list))for(const raw of list.slice(0,4)){
   const a=object(raw),sub=object(a?.subattachments)?.data;
   if(Array.isArray(sub)&&sub.length)for(const child of sub.slice(0,4))add(object(object(object(child)?.media)?.image)?.src);
   else add(object(object(a?.media)?.image)?.src);
  }
 }else{
  const list=object(o.children)?.data;
  if(Array.isArray(list)&&list.length)for(const raw of list.slice(0,4)){
   const child=object(raw);add(child?.media_type==="VIDEO"?child?.thumbnail_url:child?.media_url);
  }
  else add(o.media_type==="VIDEO"?o.thumbnail_url:o.media_type==="IMAGE"?o.media_url:null);
 }
 return images;
}
/** Never sum time-series or breakdowns as if they were a lifetime total. */
export function readLifetimeInsights(body:Obj,allowed:readonly string[]):Record<string,number>{
 const out:Record<string,number>={};
 if(!Array.isArray(body.data))return out;
 for(const raw of body.data){
  const item=object(raw),name=item?.name;
  if(typeof name!=="string"||!allowed.includes(name)||item?.period&&item.period!=="lifetime")continue;
  const values=item?.values;
  const n=Array.isArray(values)&&values.length===1?nonnegative(object(values[0])?.value):
   !values?nonnegative(object(item?.total_value)?.value):null;
  if(n!==null)out[name]=n;
 }
 return out;
}

type AccountInsightInput={mode:MetaLoginMode;version:string;token:string;appSecret:string;accountId:string;fetcher:typeof fetch};
type AccountInsights=NonNullable<MetaAnalyticsSnapshot["accountInsights"]>;
/** Read a real account-level reporting period separately from lifetime post metrics. */
export async function fetchAccountInsights(input:AccountInsightInput,allowed:boolean,now=Date.now()):Promise<AccountInsights>{
 const facebook=input.mode==="facebook";
 const keys=facebook?["page_media_view","page_total_media_view_unique","page_total_actions"]:["reach","views","accounts_engaged","total_interactions","profile_views","profile_links_taps"];
 const until=Math.floor(now/86400000)*86400,since=until-28*86400;
 const result:AccountInsights={period:facebook?"Latest provider-reported 28-day window":"Previous 28 complete UTC days ("+new Date(since*1000).toISOString().slice(0,10)+" to "+new Date((until-86400)*1000).toISOString().slice(0,10)+")",status:"unavailable",metrics:[]};
 if(!allowed||!idValid(input.accountId))return result;
 const requests=keys.map(async (name):Promise<AccountInsights["metrics"][number]|null>=>{
  try{
   const body=await graphGet({...input,path:input.accountId+"/insights",params:facebook?{metric:name,period:"days_28"}:{metric:name,period:"day",metric_type:"total_value",since:String(since),until:String(until)}});
   const item=Array.isArray(body.data)?body.data.map(object).find(v=>v?.name===name):null;
   if(!item)return null;
   if(!facebook){
    if(item.period!=="day")return null;
    const value=nonnegative(object(item.total_value)?.value);
    return value===null?null:{name,value,endAt:new Date(until*1000).toISOString()};
   }
   if(item.period!=="days_28"||!Array.isArray(item.values))return null;
   const latest=item.values.map(object).filter(v=>typeof v?.end_time==="string"&&Number.isFinite(Date.parse(v.end_time))&&Date.parse(v.end_time)<=now).sort((a,b)=>Date.parse(String(b?.end_time))-Date.parse(String(a?.end_time)))[0];
   const value=nonnegative(latest?.value);
   return value===null?null:{name,value,endAt:String(latest?.end_time)};
  }catch{return null;}
 });
 result.metrics=(await Promise.all(requests)).filter((v):v is AccountInsights["metrics"][number]=>v!==null);
 result.status=result.metrics.length===keys.length?"available":result.metrics.length?"partial":"unavailable";
 return result;
}

export const FACEBOOK_INBOX_READ_SCOPES=["pages_show_list","pages_read_engagement","pages_messaging","pages_manage_metadata"] as const;
/** Fetch only the latest bounded Messenger conversation activity for one verified Page.
 * No customer names, message bodies, participant IDs, or provider tokens leave the server.
 */
export async function fetchFacebookInboxActivity(input:{accountId:string;version:string;token:string;appSecret:string;grantedPermissions:string[];fetcher?:typeof fetch}){
 if(!idValid(input.accountId)||!validGraphVersion(input.version)||typeof input.token!=="string"||input.token.length<10||input.token.length>4096||input.appSecret.length<8||input.appSecret.length>1024)throw Error("Invalid Page connection");
 if(!FACEBOOK_INBOX_READ_SCOPES.every(scope=>input.grantedPermissions.includes(scope)))throw Error("Missing Messenger permissions");
 const fetcher=input.fetcher||fetch;
 const token=await facebookPageToken({...input,fetcher});
 const args={mode:"facebook" as const,version:input.version,token,appSecret:input.appSecret,fetcher};
 const body=await graphGet({...args,path:input.accountId+"/conversations",params:{fields:"id,updated_time",platform:"MESSENGER",limit:"25"}});
 if(!Array.isArray(body.data)||body.data.length>25)throw Error("Invalid conversation response");
 const unique=new Map<string,string|null>();
 for(const raw of body.data){
  const o=object(raw);if(!o||typeof o.id!=="string"||!/^[-_A-Za-z0-9]{1,160}$/.test(o.id))throw Error("Invalid conversation identifier");
  const stamp=text(o.updated_time,64);
  unique.set(o.id,stamp&&Number.isFinite(Date.parse(stamp))?new Date(stamp).toISOString():null);
 }
 const unread=await graphGet({...args,path:input.accountId,params:{fields:"id,unread_message_count"}}).then(v=>v.id===input.accountId?nonnegative(v.unread_message_count):null).catch(()=>null);
 return {source:"meta_graph_api" as const,accountId:input.accountId,checkedAt:new Date().toISOString(),recentConversationCount:unique.size,
  moreAvailable:Boolean(object(body.paging)?.next),lastActivity:[...unique.values()].filter((v):v is string=>v!==null).sort().reverse(),
  unreadMessages:unread,readOnly:true as const};
}

export const META_EXPANSION_SCOPES={
 ads:["ads_read"],
 businesses:["business_management"],
 leads:["ads_management","leads_retrieval","pages_show_list","pages_read_engagement","pages_manage_ads"],
 instagram_comments:["instagram_basic","instagram_manage_comments"],
 instagram_direct_comments:["instagram_business_basic","instagram_business_manage_comments"]
} as const;
export type ExpansionFeature=keyof typeof META_EXPANSION_SCOPES;
export const expansionFeatures=Object.keys(META_EXPANSION_SCOPES) as ExpansionFeature[];
export function expansionAllowed(feature:ExpansionFeature,mode:MetaLoginMode){
 return mode==="facebook"?["ads","businesses","leads"].includes(feature):mode==="instagram_unified"?feature==="instagram_comments":feature==="instagram_direct_comments";
}
function boundedList(body:Obj,limit:number):Obj[]{
 if(!Array.isArray(body.data)||body.data.length>limit)throw Error("Invalid Meta list");
 return body.data.map(v=>{const o=object(v);if(!o)throw Error("Invalid Meta record");return o;});
}
function money(v:unknown){return typeof v==="string"&&/^\d{1,14}(?:\.\d{1,8})?$/.test(v)?v:null;}
function numericCount(v:unknown){return nonnegative(v)??(typeof v==="string"&&/^\d{1,15}$/.test(v)?nonnegative(Number(v)):null);}
function timestamp(v:unknown){return typeof v==="string"&&v.length<=64&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;}
export async function fetchMetaExpansion(input:{feature:ExpansionFeature;mode:MetaLoginMode;accountId:string;version:string;token:string;appSecret:string;grantedPermissions:string[];assetId?:string;includeContacts?:boolean;fetcher?:typeof fetch}){
 const {feature,mode,accountId,version,appSecret}=input;
 if(!expansionFeatures.includes(feature)||!expansionAllowed(feature,mode)||!idValid(accountId)||!validGraphVersion(version)||typeof input.token!=="string"||input.token.length<10||input.token.length>4096||appSecret.length<8||appSecret.length>1024)throw Error("Invalid Meta expansion request");
 if(!META_EXPANSION_SCOPES[feature].every(s=>input.grantedPermissions.includes(s)))throw Error("Missing required permissions");
 const fetcher=input.fetcher||fetch;
 const args={mode,version,token:input.token,appSecret,fetcher};
 const get=(path:string,params:Record<string,string>,token=input.token)=>graphGet({...args,path,params,token});
 const result=(rows:unknown[],body:Obj)=>({feature,rows,moreAvailable:Boolean(object(body.paging)?.next),readOnly:true as const,source:"meta_graph_api" as const,checkedAt:new Date().toISOString()});
 if(feature==="ads"){
  const accounts=await get("me/adaccounts",{fields:"id,name,currency,account_status",limit:"25"});
  const discovered=boundedList(accounts,25).filter(o=>typeof o.id==="string"&&/^act_[0-9]{2,40}$/.test(o.id));
  if(input.assetId){
   const selected=discovered.find(o=>o.id===input.assetId);if(!selected)throw Error("Ad account not in verified inventory");
   const body=await get(input.assetId+"/insights",{fields:"account_id,account_currency,spend,impressions,clicks,reach,date_start,date_stop",date_preset:"last_30d",level:"account",limit:"5"});
   return result(boundedList(body,5).map(o=>({currency:text(o.account_currency,8)??text(selected.currency,8),spend:money(o.spend),impressions:numericCount(o.impressions),clicks:numericCount(o.clicks),reach:numericCount(o.reach),start:text(o.date_start,10),end:text(o.date_stop,10)})),body);
  }
  return result(discovered.map(o=>({id:o.id,name:text(o.name,200),currency:text(o.currency,8),status:numericCount(o.account_status)})),accounts);
 }
 if(feature==="businesses"){
  const body=await get("me/businesses",{fields:"id,name",limit:"25"});
  return result(boundedList(body,25).filter(o=>idValid(o.id)).map(o=>({id:o.id,name:text(o.name,200)})),body);
 }
 if(feature==="leads"){
  const pageToken=await facebookPageToken({version,token:input.token,appSecret,accountId,fetcher});
  const forms=await get(accountId+"/leadgen_forms",{fields:"id,name,status",limit:"25"},pageToken);
  const discovered=boundedList(forms,25).filter(o=>idValid(o.id));
  if(input.assetId){
   if(!discovered.some(o=>o.id===input.assetId))throw Error("Form not in selected Page inventory");
   const body=await get(input.assetId+"/leads",{fields:input.includeContacts?"id,created_time,field_data":"id,created_time",limit:"25"},pageToken);
   return result(boundedList(body,25).filter(o=>idValid(o.id)).map(o=>({id:o.id,createdAt:timestamp(o.created_time),...(input.includeContacts?{contacts:(Array.isArray(o.field_data)?o.field_data:[]).slice(0,50).map(object).filter(v=>v&&["full_name","first_name","last_name","email","phone_number"].includes(String(v.name))).flatMap(v=>Array.isArray(v?.values)?v.values.slice(0,3).filter(x=>typeof x==="string"&&x.length<=320).map(value=>({name:v!.name,value})):[])}:{})})),body);
  }
  return result(discovered.map(o=>({id:o.id,name:text(o.name,200),status:text(o.status,40)})),forms);
 }
 const media=await get(accountId+"/media",{fields:"id,media_type,timestamp,comments_count",limit:"25"});
 const discovered=boundedList(media,25).filter(o=>idValid(o.id));
 if(input.assetId){
  if(!discovered.some(o=>o.id===input.assetId))throw Error("Media not in selected Instagram inventory");
  const body=await get(input.assetId+"/comments",{fields:"id,timestamp",limit:"25"});
  return result(boundedList(body,25).filter(o=>idValid(o.id)).map(o=>({createdAt:timestamp(o.timestamp)})),body);
 }
 return result(discovered.map(o=>({id:o.id,format:text(o.media_type,40),createdAt:timestamp(o.timestamp),comments:numericCount(o.comments_count)})),media);
}
