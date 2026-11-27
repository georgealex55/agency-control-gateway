import {createHash,timingSafeEqual} from "node:crypto";
export type MetaActionKind="facebook_post"|"facebook_photo"|"facebook_link"|"instagram_photo"|"facebook_comment_reply"|"instagram_comment_reply"|"facebook_message_reply"|"instagram_message_reply";
export type MetaActionStatus="draft"|"approved"|"sending"|"sent"|"uncertain"|"blocked"|"canceled";
export const actionableKinds=["facebook_post","facebook_photo","facebook_link","instagram_photo","facebook_comment_reply","instagram_comment_reply","facebook_message_reply","instagram_message_reply"] as const;
export function validKind(v:unknown):v is MetaActionKind{return actionableKinds.some(k=>k===v);}
export const validUUID=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const validMetaId=(v:unknown):v is string=>typeof v==="string"&&v.length<=100&&/^[0-9]{2,40}(?:_[0-9]{2,40}){0,2}$/.test(v);
export function validPublicMediaURL(v:unknown):v is string{
 if(typeof v!=="string"||v.length>1200)return false;
 try{
  const u=new URL(v);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.port&&u.port!=="443")return false;
  const host=u.hostname.toLowerCase();
  if(!host.includes(".")||host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||
   host.endsWith(".localhost")||host==="metadata.google.internal"||
   host.startsWith("169.254.")||host.startsWith("127.")||host.startsWith("10.")||
   host.startsWith("192.168.")||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||
   /^\d+(?:\.\d+){3}$/.test(host)||host.includes(":")||host==="0.0.0.0")return false;
  return true;
 }catch{return false;}
}
export type MetaActionDraft={
 workspaceId:string;connectionId:string;idempotencyKey:string;kind:MetaActionKind;
 body:string;mediaUrl:string|null;targetId:string|null;scheduledAt:string
};
export function parseActionDraft(raw:unknown,now=Date.now()):MetaActionDraft|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const x=raw as Record<string,unknown>;
 if(!validUUID(x.workspaceId)||!validUUID(x.connectionId)||!validUUID(x.idempotencyKey)||!validKind(x.kind)||
  typeof x.body!=="string"||x.body.trim().length<1||x.body.length>2200||/[\u0000-\u0008\u000b\u000e-\u001f]/.test(x.body)||
  typeof x.scheduledAt!=="string"||!Number.isFinite(Date.parse(x.scheduledAt)))return null;
 const when=Date.parse(x.scheduledAt);
 if(when<now-60_000||when>now+90*86_400_000)return null;
 const image=x.kind==="instagram_photo"||x.kind==="facebook_photo"||x.kind==="facebook_link",reply=x.kind.endsWith("_reply");
 if(image?!validPublicMediaURL(x.mediaUrl):x.mediaUrl!==undefined&&x.mediaUrl!==null)return null;
 if(reply?!validMetaId(x.targetId):x.targetId!==undefined&&x.targetId!==null)return null;
 return {workspaceId:x.workspaceId,connectionId:x.connectionId,idempotencyKey:x.idempotencyKey,kind:x.kind,
  body:x.body.trim(),mediaUrl:image?x.mediaUrl as string:null,
  targetId:reply?x.targetId as string:null,scheduledAt:new Date(when).toISOString()};
}
export function validForProvider(kind:MetaActionKind,provider:string):boolean{
 return kind.startsWith("facebook_")?provider==="facebook_pages":provider==="instagram_professional";
}
export function outboundFeature(kind:MetaActionKind):"publishing"|"comments"|"messages"{
 return kind.endsWith("_post")||kind.endsWith("_photo")||kind==="facebook_link"?"publishing":kind.endsWith("comment_reply")?"comments":"messages";
}
export function secureEqual(a:string,b:string):boolean{
 const left=createHash("sha256").update(a).digest(),right=createHash("sha256").update(b).digest();
 return timingSafeEqual(left,right);
}
export function metaAutomationFlags(env:Record<string,string|undefined>=process.env){
 return {liveWrites:env.SOCIAL_META_LIVE_DELIVERY_ENABLED==="true",scheduled:env.SOCIAL_META_AUTO_POST_ENABLED==="true",
  webhook:env.SOCIAL_META_WEBHOOKS_ENABLED==="true"&&typeof env.SOCIAL_META_WEBHOOK_VERIFY_TOKEN==="string"&&env.SOCIAL_META_WEBHOOK_VERIFY_TOKEN.length>=24};
}

/** Preserve provider timestamps; never turn a stale or malformed event into a fresh reply window. */
export function metaEventTimestamp(value:unknown,now=Date.now()):string|null{
 if(typeof value!=="number"||!Number.isSafeInteger(value)||value<=0)return null;
 const millis=value>=1e12?value:value*1000;
 if(!Number.isSafeInteger(millis)||millis>now||millis<now-48*3600*1000)return null;
 return new Date(millis).toISOString();
}
export function metaCommentTarget(field:unknown,value:Record<string,unknown>|null):string|null{
 if(!value)return null;
 if(field==="feed"){
  if(value.item!=="comment"||value.verb!=="add")return null;
  return validMetaId(value.comment_id)?value.comment_id:null;
 }
 if(field==="comments")return validMetaId(value.id)?value.id:null;
 return null;
}
export function validMetaSender(v:unknown):v is string{
 return typeof v==="string"&&/^[0-9]{2,40}$/.test(v);
}
