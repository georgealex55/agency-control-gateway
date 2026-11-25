import {appSecretProof,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {validGraphVersion} from "@/lib/social-meta-contract";
type Obj=Record<string,unknown>;
const object=(v:unknown):Obj|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Obj:null;
const nonnegative=(v:unknown):number|null=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:null;
const text=(v:unknown,limit:number):string|null=>typeof v==="string"&&v.length<=limit?v:null;
const idValid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9]{2,40}$/.test(v);
const countSummary=(v:unknown):number|null=>nonnegative(object(object(v)?.summary)?.total_count);
export type MetaPostMetric={id:string;createdAt:string|null;caption:string|null;
 likes:number|null;comments:number|null;shares:number|null;link:string|null};
export type MetaAnalyticsSnapshot={
 source:"meta_graph_api";accountId:string;accountName:string|null;checkedAt:string;
 followers:number|null;totalPosts:number|null;recentPosts:MetaPostMetric[];
 recentLikes:number|null;recentComments:number|null;
 reach:number|null;reachStatus:"not_requested"|"unavailable"|"available";
 partial:boolean;period:"recent_10_posts";liveProviderRead:true;
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
 token:string;appSecret:string;grantedPermissions:string[];fetcher?:typeof fetch
}):Promise<MetaAnalyticsSnapshot>{
 if(!idValid(input.accountId)||!validGraphVersion(input.version)||typeof input.token!=="string"||
  input.token.length<10||input.token.length>4096||input.appSecret.length<8||input.appSecret.length>1024)
  throw Error("Invalid Meta analytics connection");
 const fetcher=input.fetcher||fetch;
 const facebook=input.mode==="facebook";
 let token=input.token;
 if(facebook)token=await facebookPageToken({version:input.version,token,appSecret:input.appSecret,accountId:input.accountId,fetcher});
 const mode=input.mode;
 const params=facebook?{fields:"id,name,followers_count,fan_count"}:
   {fields:"id,username,followers_count,media_count"};
 const profile=await graphGet({mode,accountId:input.accountId,version:input.version,token,appSecret:input.appSecret,
  path:input.accountId,params,fetcher});
 if(profile.id!==input.accountId)throw Error("Meta returned a different account identity");
 const postPath=input.accountId+(facebook?"/published_posts":"/media");
 const postParams=facebook?
  {fields:"id,created_time,message,permalink_url,comments.summary(true),reactions.summary(true),shares",limit:"10"}:
  {fields:"id,timestamp,caption,permalink,media_type,like_count,comments_count",limit:"10"};
 let postRecords:MetaPostMetric[]=[],partial=false;
 try{
  const body=await graphGet({mode,version:input.version,token,appSecret:input.appSecret,path:postPath,
   params:postParams,fetcher});
  if(!Array.isArray(body.data)||body.data.length>10)throw Error("Invalid recent post data");
  postRecords=body.data.map(raw=>{
   const o=object(raw);if(!o||!idValid(o.id))throw Error("Invalid provider post");
   return{id:o.id,createdAt:text(facebook?o.created_time:o.timestamp,64),
    caption:text(facebook?o.message:o.caption,2000),
    likes:facebook?countSummary(o.reactions):nonnegative(o.like_count),
    comments:facebook?countSummary(o.comments):nonnegative(o.comments_count),
    shares:facebook?nonnegative(object(o.shares)?.count):null,
    link:(()=>{
     const candidate=text(facebook?o.permalink_url:o.permalink,500);
     if(!candidate)return null;
     try{const url=new URL(candidate);return url.protocol==="https:"&&
      (url.hostname==="www.facebook.com"||url.hostname==="facebook.com"||url.hostname==="www.instagram.com"||url.hostname==="instagram.com")?url.href:null;
     }catch{return null;}
    })()};
  });
 }catch{partial=true;}
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
  reach:null,reachStatus:"not_requested",partial,period:"recent_10_posts",liveProviderRead:true};
}
