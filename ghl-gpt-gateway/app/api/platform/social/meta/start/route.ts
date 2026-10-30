import {randomBytes} from "node:crypto";
import {NextRequest} from "next/server";
import {gate,reply} from "@/lib/social-api";
import {validId,stageEnabled} from "@/lib/social-contract";
import {isMetaProvider,metaConfigured,buildMetaAuthorizeURL} from "@/lib/social-meta-contract";
import {signMetaConsent} from "@/lib/social-meta-crypto";
import {createMetaFlow} from "@/lib/social-meta-connection-store";
import {oauthSettings} from "@/lib/social-meta-oauth-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 if(!stageEnabled(process.env)||process.env.SOCIAL_META_CONNECTIONS_ENABLED!=="true")return reply({error:"Read-only Meta connections are disabled in staging"},423);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const input=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!input||!validId(input.workspaceId)||!isMetaProvider(input.provider))return reply({error:"Valid workspace and Meta provider required"},400);
 if(!metaConfigured(process.env,input.provider))return reply({error:"Meta Developer app credentials are not configured for this provider"},503);
 const settings=oauthSettings(process.env,input.provider);
 if(new URL(settings.redirectUri).origin!==req.nextUrl.origin)return reply({error:"OAuth redirect must match the active staging host"},503);
 const nonce=randomBytes(32).toString("base64url"),expires=Date.now()+10*60*1000;
 try{
  if(!await createMetaFlow(input.workspaceId,input.provider,nonce,expires))return reply({error:"Invalid workspace or too many connection attempts"},429);
  const state=signMetaConsent({workspaceId:input.workspaceId,provider:input.provider,nonce,expires},process.env.SOCIAL_META_OAUTH_STATE_SECRET!);
  const url=buildMetaAuthorizeURL({provider:input.provider,clientId:settings.clientId,redirectUri:settings.redirectUri,state,graphVersion:settings.version});
  const response=reply({authorizeUrl:url,requestedPermissions:input.provider==="facebook_pages"?["pages_show_list","pages_read_engagement"]:["instagram_business_basic"],publishingEnabled:false});
  response.cookies.set("agency_meta_nonce",nonce,{httpOnly:true,secure:true,sameSite:"lax",path:"/api/platform/social/meta/callback",maxAge:600});
  return response;
 }catch{return reply({error:"Unable to start Meta authorization"},503);}
}
