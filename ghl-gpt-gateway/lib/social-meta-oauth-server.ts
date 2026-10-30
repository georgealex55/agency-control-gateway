import type {MetaProvider} from "@/lib/social-meta-contract";
import {validGraphVersion} from "@/lib/social-meta-contract";
type ResponseShape=Record<string,unknown>;
function tokenResult(o:unknown):{token:string;expiresAt:string|null}{
 const data=o&&typeof o==="object"&&!Array.isArray(o)?o as ResponseShape:null;
 if(!data||typeof data.access_token!=="string"||data.access_token.length<10||data.access_token.length>4096)throw Error("Provider token response was invalid");
 const ttl=typeof data.expires_in==="number"&&Number.isFinite(data.expires_in)&&data.expires_in>0&&data.expires_in<10_000_000?data.expires_in:null;
 return {token:data.access_token,expiresAt:ttl?new Date(Date.now()+ttl*1000).toISOString():null};
}
export function oauthSettings(env:Record<string,string|undefined>,provider:MetaProvider){
 const clientId=provider==="facebook_pages"?env.SOCIAL_META_FACEBOOK_CLIENT_ID:env.SOCIAL_META_INSTAGRAM_CLIENT_ID;
 const clientSecret=provider==="facebook_pages"?env.SOCIAL_META_FACEBOOK_CLIENT_SECRET:env.SOCIAL_META_INSTAGRAM_CLIENT_SECRET;
 const redirectUri=env.SOCIAL_META_REDIRECT_URI,version=env.SOCIAL_META_GRAPH_VERSION;
 if(!clientId||!clientSecret||!redirectUri||!validGraphVersion(version))throw Error("Meta integration not configured");
 if(!/^[0-9]{6,32}$/.test(clientId)||clientSecret.length<8||clientSecret.length>1024)throw Error("Meta application configuration invalid");
 return {clientId,clientSecret,redirectUri,version};
}
/** Only fixed official hosts; short timeout, redirects denied, no client credentials returned to browser. */
export async function exchangeMetaCode(provider:MetaProvider,code:string,settings:ReturnType<typeof oauthSettings>,fetcher:typeof fetch=fetch){
 if(typeof code!=="string"||code.length<4||code.length>1024||!(/^[A-Za-z0-9._/-]+#?$/.test(code)))throw Error("Invalid authorization code");
 const p={client_id:settings.clientId,client_secret:settings.clientSecret,grant_type:"authorization_code",redirect_uri:settings.redirectUri,code};
 let response:Response;
 if(provider==="facebook_pages"){
  const url=new URL("https://graph.facebook.com/"+settings.version+"/oauth/access_token");
  for(const [key,value] of Object.entries(p))if(key!=="grant_type")url.searchParams.set(key,value);
  response=await fetcher(url.href,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
 }else{
  const form=new FormData();
  for(const [key,value] of Object.entries(p))form.set(key,value);
  response=await fetcher("https://api.instagram.com/oauth/access_token",{method:"POST",body:form,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
 }
 if(!response.ok)throw Error("Meta authorization code exchange failed");
 return tokenResult(await response.json());
}
