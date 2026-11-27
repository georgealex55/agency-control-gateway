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
 format:string|null;views:number|null;uniqueViewers:number|null;reach:number|null;saves:number|null;interactions:number|null;insightsStatus:"not_requested"|"available"|"partial"|"unavailable"};
export type MetaAnalyticsSnapshot={
 source:"meta_graph_api";accountId:string;accountName:string|null;checkedAt:string;
 followers:number|null;totalPosts:number|null;recentPosts:MetaPostMetric[];
 recentLikes:number|null;recentComments:number|null;
 reach:number|null;reachStatus:"not_requested"|"unavailable"|"available";
 partial:boolean;period:"recent_10_posts"|"recent_25_posts"|"recent_50_posts";liveProviderRead:true;
 requestedPosts:number;detailCoverage:number;recentShares:number|null;
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
 token:string;appSecret:string;grantedPermissions:string[];fetcher?:typeof fetch;postLimit?:number;detailed?:boolean
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
 const postParams={fields:baseFields+(detailed?(facebook?",attachments{media_type,type}":",media_product_type"):""),limit:String(postLimit)};
 let postRecords:MetaPostMetric[]=[],partial=false;
 try{
  const args={mode,version:input.version,token,appSecret:input.appSecret,path:postPath,fetcher};
  let body:Obj;
  try{body=await graphGet({...args,params:postParams});}
  catch(e){if(!detailed)throw e;partial=true;body=await graphGet({...args,params:{fields:baseFields,limit:String(postLimit)}});}
  if(!Array.isArray(body.data)||body.data.length>postLimit)throw Error("Invalid recent post data");
  postRecords=body.data.map((raw):MetaPostMetric=>{
   const o=object(raw);if(!o||!postIdValid(o.id))throw Error("Invalid provider post");
   return{id:o.id,createdAt:text(facebook?o.created_time:o.timestamp,64),
    caption:text(facebook?o.message:o.caption,2000),
    likes:facebook?countSummary(o.reactions):nonnegative(o.like_count),
    comments:facebook?countSummary(o.comments):nonnegative(o.comments_count),
    shares:facebook?nonnegative(object(o.shares)?.count):null,
    format:facebook?facebookFormat(o):text(o.media_product_type==="REELS"?"REEL":o.media_type,40),
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
  requestedPosts:postLimit,detailCoverage:detailPosts.filter(p=>p.insightsStatus==="available"||p.insightsStatus==="partial").length,recentShares:shares};
}

function facebookFormat(o:Obj):string|null{
 const items=object(o.attachments)?.data;
 if(!Array.isArray(items))return null;
 if(items.length>1)return "MULTI_ATTACHMENT";
 const a=object(items[0]);return text(a?.media_type??a?.type,40);
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
