import {createHmac} from "node:crypto";
import {validGraphVersion,type MetaProvider} from "@/lib/social-meta-contract";

/** Permission inventory is descriptive, never an authorization to publish.
 * Meta's Business Login config owns Instagram Unified Login scopes.
 */
export type MetaFeature="profile"|"analytics"|"publishing"|"scheduling"|"comments"|"messages"|"webhooks";
export type MetaFeatureStatus="available"|"permission_required"|"not_activated"|"unverified";
export type MetaLoginMode="facebook"|"instagram_direct"|"instagram_unified";
const catalog:ReadonlyArray<{key:MetaFeature;title:string;implemented:boolean}>= [
 {key:"profile",title:"Account details",implemented:true},
 {key:"analytics",title:"Insights and performance",implemented:true},
 {key:"publishing",title:"Live publishing",implemented:false},
 {key:"scheduling",title:"Scheduled automatic publishing",implemented:false},
 {key:"comments",title:"Comment management",implemented:false},
 {key:"messages",title:"Business inbox",implemented:false},
 {key:"webhooks",title:"Event-based automations",implemented:false}
];
export const metaFeatureRequirements=(mode:MetaLoginMode):Record<MetaFeature,string[]>=>{
 if(mode==="facebook")return {
  profile:["pages_show_list","pages_read_engagement"],analytics:["pages_read_engagement"],
  publishing:["pages_manage_posts"],scheduling:["pages_manage_posts"],
  comments:["pages_manage_engagement"],messages:["pages_messaging"],webhooks:["pages_manage_metadata"]
 };
 if(mode==="instagram_unified")return {
  profile:["instagram_basic"],analytics:["instagram_manage_insights"],
  publishing:["instagram_content_publish"],scheduling:["instagram_content_publish"],
  comments:["instagram_manage_comments"],messages:["instagram_manage_messages"],
  webhooks:["instagram_manage_comments"]
 };
 return {
  profile:["instagram_business_basic"],analytics:["instagram_business_manage_insights"],
  publishing:["instagram_business_content_publishing"],scheduling:["instagram_business_content_publishing"],
  comments:["instagram_business_manage_comments"],messages:["instagram_business_manage_messages"],
  webhooks:["instagram_business_manage_comments"]
 };
};
export function metaFeatureReadiness(mode:MetaLoginMode,granted:readonly string[]|null){
 const needs=metaFeatureRequirements(mode);
 return catalog.map(item=>{
  const missing=needs[item.key].filter(scope=>!granted?.includes(scope));
  const status:MetaFeatureStatus=granted===null?"unverified":missing.length?"permission_required":
   item.implemented?"available":"not_activated";
  return {id:item.key,name:item.title,status,missingPermissions:granted===null?[]:missing,
   integrationReady:item.implemented};
 });
}
export type MetaTokenInspection={
 verified:boolean;grantedScopes:string[];reason:"verified"|"unavailable"|"invalid"|"app_mismatch"|"asset_not_granted";
 expiresAt:string|null;
};
/** Restrict to Meta Graph and metadata only; no raw token, app secret, or error body in result. */
export async function inspectMetaToken(input:{
 provider:MetaProvider;token:string;accountId:string;appId:string;appSecret:string;version:string;
 fetcher?:typeof fetch;now?:number
}):Promise<MetaTokenInspection>{
 const unknown=(reason:MetaTokenInspection["reason"]):MetaTokenInspection=>({verified:false,grantedScopes:[],reason,expiresAt:null});
 if(!validGraphVersion(input.version)||!/^[0-9]{2,40}$/.test(input.accountId)||
  !/^[0-9]{6,32}$/.test(input.appId)||input.appSecret.length<8||input.appSecret.length>1024||
  typeof input.token!=="string"||input.token.length<10||input.token.length>4096)return unknown("invalid");
 const url=new URL("https://graph.facebook.com/"+input.version+"/debug_token");
 url.searchParams.set("input_token",input.token);
 const auth=input.appId+"|"+input.appSecret;
 const fetcher=input.fetcher||fetch;
 let data:Record<string,unknown>;
 try{
  const res=await fetcher(url.href,{method:"GET",redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+auth,Accept:"application/json"}});
  if(!res.ok)return unknown("unavailable");
  const body:unknown=await res.json();
  const o=body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:null;
  const d=o?.data;
  if(!d||typeof d!=="object"||Array.isArray(d))return unknown("unavailable");
  data=d as Record<string,unknown>;
 }catch{return unknown("unavailable");}
 if(data.app_id!==input.appId)return unknown("app_mismatch");
 if(data.is_valid!==true)return unknown("invalid");
 const now=Math.floor((input.now??Date.now())/1000);
 const expires=typeof data.expires_at==="number"&&Number.isSafeInteger(data.expires_at)?data.expires_at:0;
 const dataExpires=typeof data.data_access_expires_at==="number"&&Number.isSafeInteger(data.data_access_expires_at)?data.data_access_expires_at:0;
 if((expires>0&&expires<=now)||(dataExpires>0&&dataExpires<=now))return unknown("invalid");
 if(!Array.isArray(data.scopes))return unknown("unavailable");
 const scopes=data.scopes.filter((v):v is string=>typeof v==="string"&&/^[a-z][a-z0-9_]{1,90}$/.test(v)).slice(0,100);
 const granular=Array.isArray(data.granular_scopes)?data.granular_scopes:[];
 // An explicit granular target restriction must be honored for the selected Page/Instagram asset.
 const effective=scopes.filter(scope=>{
  const matching=granular.find(v=>v&&typeof v==="object"&&"scope" in v&&(v as {scope:unknown}).scope===scope) as {target_ids?:unknown}|undefined;
  if(!matching||!Array.isArray(matching.target_ids))return true;
  return matching.target_ids.some(v=>String(v)===input.accountId);
 });
 return {verified:true,grantedScopes:[...new Set(effective)],
  reason:scopes.length>0&&effective.length===0?"asset_not_granted":"verified",
  expiresAt:expires>0?new Date(expires*1000).toISOString():null};
}
export function appSecretProof(token:string,secret:string):string{
 return createHmac("sha256",secret).update(token).digest("hex");
}
