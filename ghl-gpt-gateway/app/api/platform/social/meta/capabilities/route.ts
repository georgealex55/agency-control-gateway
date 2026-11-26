import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {instagramUnifiedReady} from "@/lib/social-meta-instagram-unified";
import {inspectMetaToken,metaFeatureReadiness,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {validGraphVersion} from "@/lib/social-meta-contract";
import {metaAutomationFlags} from "@/lib/social-meta-automation-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
/** Every result is bound to the logged-in owner's selected workspace.
 * No token, app key or raw provider response reaches the browser.
 */
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 const connectionId=req.nextUrl.searchParams.get("connectionId");
 if(!workspaceId||!validId(connectionId))return reply({error:"Valid workspace and connected account required"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;
 if(!validGraphVersion(version))return reply({error:"Meta connection configuration unavailable"},503);
 try{
  const credential=await metaConnectionCredential(workspaceId,connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential)return reply({error:"Connected account not found"},404);
  const env=await resolvedMetaEnv(credential.provider);
  const fb=credential.provider==="facebook_pages",unified=!fb&&instagramUnifiedReady(env);
  const mode:MetaLoginMode=fb?"facebook":unified?"instagram_unified":"instagram_direct";
  const prefix=fb?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
  const clientId=env[prefix+"_CLIENT_ID"]||"",clientSecret=env[prefix+"_CLIENT_SECRET"]||"";
  const proof=await inspectMetaToken({provider:credential.provider,token:credential.token,
   accountId:credential.accountId,appId:clientId,appSecret:clientSecret,version});
  const flags=metaAutomationFlags();
  const activated={publishing:flags.liveWrites,scheduling:flags.liveWrites&&flags.scheduled,comments:flags.liveWrites&&flags.webhook,messages:flags.liveWrites&&flags.webhook,webhooks:false};
  return reply({workspaceId,connectionId,provider:credential.provider,accountId:credential.accountId,mode,
   checkedAt:new Date().toISOString(),permissionCheck:proof.reason,
   permissionsVerified:proof.verified,tokenExpiresAt:proof.expiresAt,
   grantedPermissions:proof.verified?proof.grantedScopes:[],
   features:metaFeatureReadiness(mode,proof.verified?proof.grantedScopes:null,activated),
   publishingEnabled:flags.liveWrites,scheduledAutoPostingEnabled:flags.liveWrites&&flags.scheduled,externalMessagingEnabled:flags.liveWrites&&flags.webhook});
 }catch{
  return reply({error:"Could not check Meta permissions. Keep the connection and retry or reconnect."},503);
 }
}
