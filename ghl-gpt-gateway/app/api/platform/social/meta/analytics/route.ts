import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {instagramUnifiedReady} from "@/lib/social-meta-instagram-unified";
import {inspectMetaToken,metaFeatureRequirements,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {fetchMetaAnalytics} from "@/lib/social-meta-analytics";
import {validGraphVersion} from "@/lib/social-meta-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),connectionId=req.nextUrl.searchParams.get("connectionId");
 if(!workspaceId||!validId(connectionId))return reply({error:"Select a connected Meta account"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;
 if(!validGraphVersion(version))return reply({error:"Meta insights are not configured"},503);
 try{
  const credential=await metaConnectionCredential(workspaceId,connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential)return reply({error:"Connection is unavailable. Reconnect this account."},404);
  const env=await resolvedMetaEnv(credential.provider);
  const facebook=credential.provider==="facebook_pages",mode:MetaLoginMode=facebook?"facebook":
   instagramUnifiedReady(env)?"instagram_unified":"instagram_direct";
  const prefix=facebook?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
  const appId=env[prefix+"_CLIENT_ID"]||"",appSecret=env[prefix+"_CLIENT_SECRET"]||"";
  const inspection=await inspectMetaToken({provider:credential.provider,token:credential.token,
   appId,appSecret,version,accountId:credential.accountId});
  if(!inspection.verified)return reply({error:"Meta permissions could not be verified. Reconnect or retry the permission check.",requiredAction:"verify_permissions",permissionCheck:inspection.reason},424);
  const missing=metaFeatureRequirements(mode).profile.filter(x=>!inspection.grantedScopes.includes(x));
  if(missing.length)return reply({error:"Account access permissions are missing. Reconnect this account with the requested permissions.",
   requiredAction:"reauthorize",missingPermissions:missing},403);
  const snapshot=await fetchMetaAnalytics({mode,accountId:credential.accountId,token:credential.token,
   appSecret,version,grantedPermissions:inspection.grantedScopes});
  return reply({workspaceId,connectionId,provider:credential.provider,snapshot,permissionsVerified:true,
   publishingEnabled:false,metricsAreReal:true});
 }catch{return reply({error:"Meta analytics were not available for this account. Verify permissions or reconnect.",requiredAction:"reauthorize_or_retry"},503);}
}