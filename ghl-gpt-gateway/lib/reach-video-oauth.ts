import "server-only";
import {createHash} from "node:crypto";

/** Provider transport only. Do not expose through a route until workspace-bound,
 * one-use OAuth state, encrypted storage, account selection and refresh locking exist. */
export type VideoProvider="youtube"|"tiktok";
export const VIDEO_OAUTH={
 youtube:{authorize:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token",scopes:["https://www.googleapis.com/auth/youtube.readonly"],key:"client_id"},
 tiktok:{authorize:"https://www.tiktok.com/v2/auth/authorize/",token:"https://open.tiktokapis.com/v2/oauth/token/",scopes:["user.info.basic"],key:"client_key"}
} as const;
export type VideoConfig={provider:VideoProvider;clientId:string;clientSecret:string;redirectUri:string};
export type VideoToken={accessToken:string;refreshToken:string;expiresAt:string;refreshExpiresAt:string|null;scopes:string[];openId:string|null};
export type VideoAccount={id:string;name:string};
type Fetcher=typeof fetch;
type Obj=Record<string,unknown>;
function record(v:unknown):Obj{
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Invalid provider response");
 return v as Obj;
}
function str(v:unknown,max=4096):string{
 if(typeof v!=="string"||!v.length||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw Error("Invalid provider value");
 return v;
}
function expiration(v:unknown):string{
 if(typeof v!=="number"||!Number.isSafeInteger(v)||v<=0||v>315360000)throw Error("Invalid provider expiry");
 return new Date(Date.now()+v*1000).toISOString();
}
export function videoOAuthConfig(env:Record<string,string|undefined>,provider:VideoProvider,origin:string):VideoConfig|null{
 const prefix=provider==="youtube"?"SOCIAL_YOUTUBE_":"SOCIAL_TIKTOK_";
 if(env[prefix+"ENABLED"]!=="true")return null;
 const clientId=env[prefix+"CLIENT_ID"],clientSecret=env[prefix+"CLIENT_SECRET"],redirectUri=env[prefix+"REDIRECT_URI"];
 if(!clientId||!clientSecret||!redirectUri)return null;
 try{
  const u=new URL(redirectUri),o=new URL(origin);
  if(o.protocol!=="https:"||o.origin!==origin||u.origin!==o.origin||u.username||u.password||u.search||u.hash||
     u.pathname!=="/api/reach/connections/"+provider+"/callback"||u.href!==redirectUri)return null;
  str(clientId,512);str(clientSecret,1024);
  return {provider,clientId,clientSecret,redirectUri};
 }catch{return null;}
}
const opaque=(v:string)=>/^[A-Za-z0-9_-]{43,128}$/.test(v);
export function buildVideoAuthorizeUrl(c:VideoConfig,state:string,verifier?:string):string{
 if(!opaque(state))throw Error("Invalid OAuth state");
 const spec=VIDEO_OAUTH[c.provider],u=new URL(spec.authorize);
 u.searchParams.set(spec.key,c.clientId);u.searchParams.set("redirect_uri",c.redirectUri);
 u.searchParams.set("response_type","code");u.searchParams.set("state",state);
 u.searchParams.set("scope",spec.scopes.join(c.provider==="youtube"?" ":","));
 if(c.provider==="youtube"){
  if(!verifier||!opaque(verifier))throw Error("Missing PKCE verifier");
  u.searchParams.set("code_challenge",createHash("sha256").update(verifier).digest("base64url"));
  u.searchParams.set("code_challenge_method","S256");
  u.searchParams.set("access_type","offline");u.searchParams.set("prompt","consent");
 }else u.searchParams.set("disable_auto_auth","1");
 return u.href;
}
async function json(fetcher:Fetcher,url:string,init:RequestInit):Promise<Obj>{
 const res=await fetcher(url,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error("Provider request rejected");
 return record(await res.json());
}
function parseToken(c:VideoConfig,body:Obj,prior?:VideoToken):VideoToken{
 if(body.error)throw Error("Provider authorization rejected");
 if(typeof body.token_type!=="string"||body.token_type.toLowerCase()!=="bearer")throw Error("Invalid token type");
 const scopes=typeof body.scope==="string"?body.scope.split(/[ ,]+/).filter(Boolean):prior?.scopes;
 if(!scopes||!VIDEO_OAUTH[c.provider].scopes.every(s=>scopes.includes(s))||
    scopes.some(s=>!(VIDEO_OAUTH[c.provider].scopes as readonly string[]).includes(s)))throw Error("Unexpected or missing permissions");
 const openId=c.provider==="tiktok"?str(body.open_id,256):null;
 if(prior?.openId&&openId!==prior.openId)throw Error("Provider identity changed");
 return {accessToken:str(body.access_token),refreshToken:str(body.refresh_token??prior?.refreshToken),
  expiresAt:expiration(body.expires_in),refreshExpiresAt:body.refresh_expires_in==null?prior?.refreshExpiresAt??null:expiration(body.refresh_expires_in),
  scopes:[...new Set(scopes)],openId};
}
async function token(c:VideoConfig,params:URLSearchParams,fetcher:Fetcher,prior?:VideoToken):Promise<VideoToken>{
 params.set(VIDEO_OAUTH[c.provider].key,c.clientId);params.set("client_secret",c.clientSecret);
 return parseToken(c,await json(fetcher,VIDEO_OAUTH[c.provider].token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:params}),prior);
}
export async function exchangeVideoCode(c:VideoConfig,code:string,verifier?:string,fetcher:Fetcher=fetch):Promise<VideoToken>{
 const p=new URLSearchParams({grant_type:"authorization_code",code:str(code,4096),redirect_uri:c.redirectUri});
 if(c.provider==="youtube"){
  if(!verifier||!opaque(verifier))throw Error("Missing PKCE verifier");
  p.set("code_verifier",verifier);
 }
 return token(c,p,fetcher);
}
/** Caller must lock the connection and atomically replace rotated refresh tokens. */
export async function refreshVideoToken(c:VideoConfig,prior:VideoToken,fetcher:Fetcher=fetch):Promise<VideoToken>{
 return token(c,new URLSearchParams({grant_type:"refresh_token",refresh_token:str(prior.refreshToken)}),fetcher,prior);
}
export async function discoverVideoAccounts(c:VideoConfig,t:VideoToken,fetcher:Fetcher=fetch):Promise<VideoAccount[]>{
 const headers={Authorization:"Bearer "+str(t.accessToken),Accept:"application/json"};
 if(c.provider==="youtube"){
  const r=await json(fetcher,"https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",{method:"GET",headers});
  if(!Array.isArray(r.items)||!r.items.length||r.items.length>50||r.nextPageToken)throw Error("Channel selection unavailable or incomplete");
  const seen=new Set<string>();
  return r.items.map(v=>{const a=record(v),id=str(a.id,128);if(!/^UC[A-Za-z0-9_-]{22}$/.test(id)||seen.has(id))throw Error("Invalid channel identity");seen.add(id);return {id,name:str(record(a.snippet).title,150)};});
 }
 const r=await json(fetcher,"https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",{method:"GET",headers});
 if(record(r.error).code!=="ok")throw Error("TikTok profile rejected");
 const u=record(record(r.data).user),id=str(u.open_id,256);
 if(!t.openId||id!==t.openId)throw Error("TikTok profile identity mismatch");
 return [{id,name:str(u.display_name,150)}];
}
