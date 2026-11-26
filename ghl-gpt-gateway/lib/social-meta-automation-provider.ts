import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {instagramUnifiedReady} from "@/lib/social-meta-instagram-unified";
import {inspectMetaToken,appSecretProof,metaFeatureRequirements,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {authorizedReplyTarget,type MetaStoredAction} from "@/lib/social-meta-automation-store";
import {validGraphVersion} from "@/lib/social-meta-contract";
import {validForProvider,outboundFeature,validMetaId} from "@/lib/social-meta-automation-contract";
type Json=Record<string,unknown>;
const object=(v:unknown):Json|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Json:null;
export type MetaDeliveryResult={externalRef:string;kind:string};
export type MetaDeliveryErrorCode="PERMISSION_UNVERIFIED"|"PERMISSION_MISSING"|"ACCOUNT_MISMATCH"|"TARGET_NOT_AUTHORIZED"|"META_RESPONSE_INVALID"|"META_REJECTED"|"META_UNAVAILABLE"|"FEATURE_DISABLED";
export class MetaDeliveryError extends Error{
 constructor(public readonly code:MetaDeliveryErrorCode){super(code);}
}
const permittedId=(v:unknown)=>typeof v==="string"&&/^[0-9]{2,40}(?:_[0-9]{2,40})?$/.test(v);
async function graph(input:{host:"graph.facebook.com"|"graph.instagram.com";version:string;
 token:string;secret:string;path:string;method:"GET"|"POST";params:Record<string,string>;fetcher:typeof fetch}):Promise<Json>{
 const url="https://"+input.host+"/"+input.version+"/"+input.path;
 const proof=appSecretProof(input.token,input.secret);
 const form=new URLSearchParams({...input.params,appsecret_proof:proof});
 const endpoint=input.method==="GET"?url+"?"+form.toString():url;
 let res:Response;
 try{res=await input.fetcher(endpoint,{method:input.method,redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(10000),headers:{Authorization:"Bearer "+input.token,Accept:"application/json",
   ...(input.method==="POST"?{"Content-Type":"application/x-www-form-urlencoded"}:{})},
  ...(input.method==="POST"?{body:form.toString()}:{})});}
 catch{throw new MetaDeliveryError("META_UNAVAILABLE");}
 if(!res.ok)throw new MetaDeliveryError("META_REJECTED");
 let json:unknown;
 try{json=await res.json();}catch{throw new MetaDeliveryError("META_RESPONSE_INVALID");}
 const obj=object(json);if(!obj)throw new MetaDeliveryError("META_RESPONSE_INVALID");
 return obj;
}
/** Server-side Page token, tied to exactly the Page selected in REACH; never
 * return the token from this module to a client response or audit record. */
async function facebookPageToken(input:{version:string;userToken:string;secret:string;accountId:string;fetcher:typeof fetch}){
 const pageData=await graph({host:"graph.facebook.com",version:input.version,token:input.userToken,secret:input.secret,
  path:"me/accounts",method:"GET",params:{fields:"id,name,tasks,access_token",limit:"100"},fetcher:input.fetcher});
 if(!Array.isArray(pageData.data))throw new MetaDeliveryError("ACCOUNT_MISMATCH");
 const candidate=pageData.data.map(object).find(x=>x?.id===input.accountId);
 const token=candidate?.access_token;
 if(typeof token!=="string"||token.length<10||token.length>4096)throw new MetaDeliveryError("ACCOUNT_MISMATCH");
 const tasks=Array.isArray(candidate?.tasks)?candidate.tasks:[];
 if(!tasks.includes("CREATE_CONTENT")&&!tasks.includes("MANAGE")&&!tasks.includes("MODERATE")&&!tasks.includes("MESSAGING"))
  throw new MetaDeliveryError("PERMISSION_MISSING");
 return {token,taskList:tasks as string[]};
}
async function assertPermissions(action:MetaStoredAction,fetcher:typeof fetch){
 const cred=await metaConnectionCredential(action.workspaceId,action.connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
 if(!cred||!validForProvider(action.kind,cred.provider))throw new MetaDeliveryError("ACCOUNT_MISMATCH");
 const env=await resolvedMetaEnv(cred.provider);
 const mode:MetaLoginMode=cred.provider==="facebook_pages"?"facebook":
  instagramUnifiedReady(env)?"instagram_unified":"instagram_direct";
 const prefix=cred.provider==="facebook_pages"?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
 const appId=env[prefix+"_CLIENT_ID"]||"",appSecret=env[prefix+"_CLIENT_SECRET"]||"";
 const version=env.SOCIAL_META_GRAPH_VERSION||"";
 if(!validGraphVersion(version))throw new MetaDeliveryError("FEATURE_DISABLED");
 const permission=await inspectMetaToken({provider:cred.provider,token:cred.token,accountId:cred.accountId,
  appId,appSecret,version,fetcher});
 if(!permission.verified)throw new MetaDeliveryError("PERMISSION_UNVERIFIED");
 const feature=outboundFeature(action.kind),needed=metaFeatureRequirements(mode)[feature];
 if(needed.some(x=>!permission.grantedScopes.includes(x)))throw new MetaDeliveryError("PERMISSION_MISSING");
 const reply=action.kind.endsWith("_reply");
 if(reply&&(!action.targetId||!await authorizedReplyTarget(action.workspaceId,action.connectionId,action.kind,action.targetId)))
  throw new MetaDeliveryError("TARGET_NOT_AUTHORIZED");
 const host=mode==="instagram_direct"?"graph.instagram.com":"graph.facebook.com";
 let token=cred.token;
 if(mode==="facebook"){
  const page=await facebookPageToken({version,userToken:token,secret:appSecret,accountId:cred.accountId,fetcher});
  const allowed=action.kind==="facebook_post"?["CREATE_CONTENT","MANAGE"]:action.kind==="facebook_comment_reply"?["MODERATE","MANAGE"]:["MESSAGING","MANAGE"];
  if(!page.taskList.some(v=>allowed.includes(v)))throw new MetaDeliveryError("PERMISSION_MISSING");
  token=page.token;
 }
 return {host:host as "graph.instagram.com"|"graph.facebook.com",version,token,secret:appSecret,accountId:cred.accountId,mode};
}
/** One externally visible attempt per approved action; the caller MUST have
 * atomically claimed it. Failures become uncertain, never automatically retried.
 */
export async function deliverMetaAction(action:MetaStoredAction,fetcher:typeof fetch=fetch):Promise<MetaDeliveryResult>{
 if(process.env.SOCIAL_META_LIVE_DELIVERY_ENABLED!=="true")throw new MetaDeliveryError("FEATURE_DISABLED");
 const p=await assertPermissions(action,fetcher);
 const send=(path:string,params:Record<string,string>)=>graph({host:p.host,version:p.version,token:p.token,secret:p.secret,
  path,method:"POST",params,fetcher});
 let response:Json;
 if(action.kind==="facebook_post"){
  response=await send(p.accountId+"/feed",{message:action.body});
 }else if(action.kind==="instagram_photo"){
  if(!action.mediaUrl)throw new MetaDeliveryError("META_RESPONSE_INVALID");
  const container=await send(p.accountId+"/media",{image_url:action.mediaUrl,caption:action.body});
  if(!permittedId(container.id))throw new MetaDeliveryError("META_RESPONSE_INVALID");
  // Meta processes Instagram image containers before publishing. A container
  // whose state isn't finished must not be published yet.
  let ready=false;
  for(let i=0;i<3;i++){
   const status=await graph({host:p.host,version:p.version,token:p.token,secret:p.secret,path:String(container.id),
    method:"GET",params:{fields:"status_code"},fetcher});
   if(status.status_code==="FINISHED"){ready=true;break;}
   if(status.status_code==="ERROR"||status.status_code==="EXPIRED")throw new MetaDeliveryError("META_REJECTED");
   await new Promise(r=>setTimeout(r,1500));
  }
  if(!ready)throw new MetaDeliveryError("META_UNAVAILABLE");
  response=await send(p.accountId+"/media_publish",{creation_id:String(container.id)});
 }else if(action.kind==="facebook_comment_reply"||action.kind==="instagram_comment_reply"){
  if(!action.targetId)throw new MetaDeliveryError("TARGET_NOT_AUTHORIZED");
  response=await send(action.targetId+(action.kind==="facebook_comment_reply"?"/comments":"/replies"),{message:action.body});
 }else{
  if(!action.targetId)throw new MetaDeliveryError("TARGET_NOT_AUTHORIZED");
  // Only a reply to a webhook-verified inbound conversation within the last
  // 24h is accepted; no cold outreach, mass DMs or marketing tags.
  const base=action.kind==="facebook_message_reply"?p.accountId:"me";
  const payload={messaging_type:"RESPONSE",recipient:{id:action.targetId},message:{text:action.body}};
  response=await send(base+"/messages",{...Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,typeof v==="string"?v:JSON.stringify(v)]))});
 }
 const id=response.id??response.message_id;
 if(typeof id!=="string"||id.length>240||!(/^[A-Za-z0-9_-]{4,240}$/.test(id)))throw new MetaDeliveryError("META_RESPONSE_INVALID");
 return {externalRef:id,kind:action.kind};
}
