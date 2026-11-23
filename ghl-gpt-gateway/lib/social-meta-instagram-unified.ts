import {parseMetaTokenPayload} from "./social-meta-token-lifecycle";
import {validGraphVersion,validMetaRedirect} from "./social-meta-contract";

/** Opt-in only. Existing direct Instagram Login remains unchanged until Meta's
 * business-owned Unified Login config_id is explicitly installed in Vercel.
 * A config_id is public configuration, never an access token or App Secret.
 */
export function instagramUnifiedRequested(env:Record<string,string|undefined>):boolean{
 return env.SOCIAL_META_INSTAGRAM_UNIFIED_ENABLED==="true";
}
export function instagramUnifiedConfigId(env:Record<string,string|undefined>):string|null{
 const id=(env.SOCIAL_META_INSTAGRAM_UNIFIED_CONFIG_ID||"").trim();
 return instagramUnifiedRequested(env)&&/^[0-9]{6,32}$/.test(id)?id:null;
}
export function instagramUnifiedReady(env:Record<string,string|undefined>):boolean{
 return instagramUnifiedConfigId(env)!==null;
}
export function buildInstagramUnifiedAuthorizeURL(input:{
 clientId:string;configId:string;redirectUri:string;state:string
}):string{
 if(!/^[0-9]{6,32}$/.test(input.clientId)||!/^[0-9]{6,32}$/.test(input.configId)||
    !validMetaRedirect(input.redirectUri)||!/^[-_A-Za-z0-9.]{30,700}$/.test(input.state))throw Error("Invalid Unified Login configuration");
 const url=new URL("https://www.facebook.com/dialog/oauth");
 url.searchParams.set("client_id",input.clientId);
 url.searchParams.set("config_id",input.configId);
 url.searchParams.set("redirect_uri",input.redirectUri);
 url.searchParams.set("response_type","code");
 url.searchParams.set("override_default_response_type","true");
 url.searchParams.set("prompt","login");
 url.searchParams.set("state",input.state);
 // Never add a direct-Instagram scope. The Meta-owned configuration controls
 // the selected assets and required permissions. No publishing API is enabled.
 return url.href;
}
function validToken(token:unknown):token is string{
 return typeof token==="string"&&token.length>=10&&token.length<=4096;
}
export async function exchangeInstagramUnifiedCode(input:{
 code:string;clientId:string;clientSecret:string;redirectUri:string;version:string;fetcher?:typeof fetch
}):Promise<{token:string;expiresAt:string|null}>{
 if(!/^[A-Za-z0-9._/-]{4,1024}(?:#_?)?$/.test(input.code)||
    !/^[0-9]{6,32}$/.test(input.clientId)||
    typeof input.clientSecret!=="string"||input.clientSecret.length<8||input.clientSecret.length>1024||
    !validGraphVersion(input.version)||!validMetaRedirect(input.redirectUri))throw Error("Invalid Unified Login code exchange");
 const url=new URL("https://graph.facebook.com/"+input.version+"/oauth/access_token");
 url.searchParams.set("client_id",input.clientId);
 url.searchParams.set("client_secret",input.clientSecret);
 url.searchParams.set("code",input.code);
 url.searchParams.set("redirect_uri",input.redirectUri);
 const response=await (input.fetcher||fetch)(url.href,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
  headers:{Accept:"application/json"}});
 if(!response.ok)throw Error("Unified Login authorization code exchange rejected");
 return parseMetaTokenPayload(await response.json());
}
export type InstagramUnifiedCandidate={id:string;name:string;accountType:"UNKNOWN"};
/** The BISU token's /me is a system user, NOT the selected Instagram profile.
 * Enumerate only the accounts explicitly assigned by Meta in Unified Login.
 */
export async function listInstagramUnifiedAccounts(input:{
 token:string;version:string;fetcher?:typeof fetch
}):Promise<{businessId:string;accounts:InstagramUnifiedCandidate[]}>{
 if(!validToken(input.token)||!validGraphVersion(input.version))throw Error("Invalid Unified Login profile query");
 const request=async(path:string)=>{
  const url="https://graph.facebook.com/"+input.version+"/"+path;
  const response=await (input.fetcher||fetch)(url,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
   headers:{Authorization:"Bearer "+input.token,Accept:"application/json"}});
  if(!response.ok)throw Error("Meta rejected authorized business/Instagram asset discovery");
  const body:unknown=await response.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid Meta asset response");
  return body as Record<string,unknown>;
 };
 const business=await request("me?fields=client_business_id");
 const businessId=business.client_business_id;
 if(typeof businessId!=="string"||!/^[0-9]{2,40}$/.test(businessId))throw Error("Meta Unified Login client business ID not returned");
 const result=await request("me/assigned_instagram_accounts?fields=id%2Cusername&limit=25");
 if(!Array.isArray(result.data)||result.data.length===0||result.data.length>25)throw Error("No Instagram Professional accounts assigned to this Meta business integration");
 // Fail closed if some approved assets are missing from this result; do not
 // present a partial selection as the complete set.
 if(result.paging&&typeof result.paging==="object"&&result.paging!==null&&
   "next" in result.paging&&typeof result.paging.next==="string")throw Error("Too many assigned Instagram accounts; pagination support required");
 const seen=new Set<string>();
 const accounts=result.data.map((r:unknown)=>{
  if(!r||typeof r!=="object"||Array.isArray(r))throw Error("Invalid assigned Instagram account");
  const a=r as Record<string,unknown>;
  if(typeof a.id!=="string"||!/^[0-9]{2,40}$/.test(a.id)||typeof a.username!=="string"||
     !/^[A-Za-z0-9._]{1,30}$/.test(a.username)||seen.has(a.id))throw Error("Invalid or duplicate Instagram asset");
  seen.add(a.id);
  return {id:a.id,name:"@"+a.username,accountType:"UNKNOWN" as const};
 });
 return {businessId,accounts};
}
