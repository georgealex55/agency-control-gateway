import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {connectionGate,reply} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {connectionRuntimeEnabled} from "@/lib/reach-connection-runtime";
import {isMetaProvider,metaConfigured,metaSetupStatus,buildMetaAuthorizeURL,duplicateMetaAppId,metaRequestedPermissions,validMetaPermissionPreset,type MetaPermissionPreset} from "@/lib/social-meta-contract";
import {signMetaConsent} from "@/lib/social-meta-crypto";
import {createMetaFlow} from "@/lib/social-meta-connection-store";
import {oauthSettings} from "@/lib/social-meta-oauth-server";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {instagramUnifiedReady,instagramUnifiedRequested,instagramUnifiedConfigId,buildInstagramUnifiedAuthorizeURL} from "@/lib/social-meta-instagram-unified";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 if(!connectionRuntimeEnabled()||process.env.SOCIAL_META_CONNECTIONS_ENABLED!=="true")return reply({error:"Read-only Meta connections are not enabled for this environment"},423);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const input=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!input||!validId(input.workspaceId)||!isMetaProvider(input.provider))return reply({error:"Valid workspace and Meta provider required"},400);
 const requested=input.permissionPreset??"basic";
 if(!validMetaPermissionPreset(input.provider,requested))
  return reply({error:"Unsupported permission request"},400);
 const preset:MetaPermissionPreset=requested;
 const metaEnv=await resolvedMetaEnv(input.provider);
 if(!metaConfigured(metaEnv,input.provider))return reply({error:"Meta Developer app credentials are not configured for this provider"},503);
 if(input.provider==="instagram_professional"){
  if(instagramUnifiedRequested(metaEnv)&&!instagramUnifiedReady(metaEnv))
   return reply({error:"Instagram Unified Login is awaiting its Meta Business Login configuration ID. REACH platform setup must be completed before authorization."},409);
  const facebookEnv=await resolvedMetaEnv("facebook_pages");
  if(!instagramUnifiedReady(metaEnv)&&duplicateMetaAppId(facebookEnv.SOCIAL_META_FACEBOOK_CLIENT_ID,metaEnv.SOCIAL_META_INSTAGRAM_CLIENT_ID))
   return reply({error:"Instagram Direct Login cannot authorize using this Facebook App ID. If Meta provides a separate Instagram Login App ID, save it under Instagram only. If Meta requires Unified Login, that different authorization flow is not yet enabled in REACH."},409);
 }
 const settings=oauthSettings(metaEnv,input.provider);
 const setup=metaSetupStatus(metaEnv,input.provider,req.nextUrl.origin);
 if(!setup.isCanonicalHost||!setup.branchMatches)return reply({
  error:"OAuth must start from the configured canonical callback hostname",
  canonicalStagingUrl:setup.callbackUrl?new URL(setup.callbackUrl).origin:null
 },409);
 const nonce=randomBytes(32).toString("base64url"),expires=Date.now()+10*60*1000;
 try{
  if(!await createMetaFlow(input.workspaceId,input.provider,nonce,expires))return reply({error:"Invalid workspace or too many connection attempts"},429);
  const state=signMetaConsent({workspaceId:input.workspaceId,provider:input.provider,nonce,expires},process.env.SOCIAL_META_OAUTH_STATE_SECRET!);
  const unified=input.provider==="instagram_professional"&&instagramUnifiedReady(metaEnv);
  const configId=unified?instagramUnifiedConfigId(metaEnv):null;
  const url=unified&&configId?
   buildInstagramUnifiedAuthorizeURL({clientId:settings.clientId,configId,redirectUri:settings.redirectUri,state}):
   buildMetaAuthorizeURL({provider:input.provider,clientId:settings.clientId,redirectUri:settings.redirectUri,state,graphVersion:settings.version,permissionPreset:preset});
  const response=reply({authorizeUrl:url,requestedPermissions:unified?[]:metaRequestedPermissions(input.provider,preset),
   permissionSource:unified?"meta_login_configuration":"explicit_scopes",publishingEnabled:false});
  response.cookies.set("agency_meta_nonce_"+input.provider,nonce,{httpOnly:true,secure:true,sameSite:"lax",path:"/api/platform/social/meta/callback",maxAge:600});
  return response;
 }catch{return reply({error:"Unable to start Meta authorization"},503);}
}
