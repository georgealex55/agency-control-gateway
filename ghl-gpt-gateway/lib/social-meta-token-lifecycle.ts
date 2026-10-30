/**
 * Server-side Meta token lifecycle. No publish scopes, media calls or browser token storage.
 * All external URLs have fixed trusted hosts and redirects are forbidden.
 */
export type LifedToken={token:string;expiresAt:string|null};
type Plain=Record<string,unknown>;
export function parseMetaTokenPayload(value:unknown,now=Date.now()):LifedToken{
 let raw=value;
 if(value&&typeof value==="object"&&!Array.isArray(value)&&"data" in value){
  const list=(value as Plain).data;
  if(!Array.isArray(list)||list.length!==1||(value as Plain).access_token!==undefined)throw Error("Ambiguous provider token response");
  raw=list[0];
 }
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid provider token response");
 const v=raw as Plain;
 if(typeof v.access_token!=="string"||v.access_token.length<10||v.access_token.length>4096)throw Error("Invalid provider token");
 const ttl=typeof v.expires_in==="number"&&Number.isSafeInteger(v.expires_in)&&v.expires_in>0&&v.expires_in<=10_000_000?v.expires_in:null;
 return {token:v.access_token,expiresAt:ttl?new Date(now+ttl*1000).toISOString():null};
}
export async function exchangeInstagramLongLived(input:{
 shortLivedToken:string;appSecret:string;fetcher?:typeof fetch;now?:number
}):Promise<LifedToken>{
 if(typeof input.shortLivedToken!=="string"||input.shortLivedToken.length<10||input.shortLivedToken.length>4096||
 typeof input.appSecret!=="string"||input.appSecret.length<8||input.appSecret.length>1024)throw Error("Invalid Instagram token exchange credentials");
 const url=new URL("https://graph.instagram.com/access_token");
 url.searchParams.set("grant_type","ig_exchange_token");
 url.searchParams.set("client_secret",input.appSecret);
 url.searchParams.set("access_token",input.shortLivedToken);
 const res=await (input.fetcher||fetch)(url.href,{
  method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),headers:{"Accept":"application/json"}
 });
 if(!res.ok)throw Error("Instagram long-lived token exchange failed");
 const result=parseMetaTokenPayload(await res.json(),input.now);
 // For safety never persist an unbounded or short-lived token as a durable connection.
 if(!result.expiresAt||Date.parse(result.expiresAt)-(input.now??Date.now())<24*60*60*1000)throw Error("Instagram token lifetime is insufficient");
 return result;
}
export async function exchangeFacebookLongLived(input:{
 shortLivedToken:string;appId:string;appSecret:string;graphVersion:string;fetcher?:typeof fetch;now?:number
}):Promise<LifedToken>{
 if(typeof input.shortLivedToken!=="string"||input.shortLivedToken.length<10||input.shortLivedToken.length>4096||
 !/^[0-9]{6,32}$/.test(input.appId)||typeof input.appSecret!=="string"||input.appSecret.length<8||input.appSecret.length>1024||
 !/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(input.graphVersion))throw Error("Invalid Facebook token exchange credentials");
 const url=new URL("https://graph.facebook.com/"+input.graphVersion+"/oauth/access_token");
 url.searchParams.set("grant_type","fb_exchange_token");
 url.searchParams.set("client_id",input.appId);
 url.searchParams.set("client_secret",input.appSecret);
 url.searchParams.set("fb_exchange_token",input.shortLivedToken);
 const res=await (input.fetcher||fetch)(url.href,{
  method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),headers:{"Accept":"application/json"}
 });
 if(!res.ok)throw Error("Facebook extended token exchange failed");
 const result=parseMetaTokenPayload(await res.json(),input.now);
 if(!result.expiresAt||Date.parse(result.expiresAt)-(input.now??Date.now())<24*60*60*1000)throw Error("Facebook token lifetime is insufficient");
 return result;
}
