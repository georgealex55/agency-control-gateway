import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {inspectMetaToken,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {instagramUnifiedReady} from "@/lib/social-meta-instagram-unified";
import {validGraphVersion} from "@/lib/social-meta-contract";
import {expansionAllowed,expansionFeatures,META_EXPANSION_SCOPES,fetchMetaExpansion,type ExpansionFeature} from "@/lib/social-meta-analytics";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),connectionId=req.nextUrl.searchParams.get("connectionId"),requested=req.nextUrl.searchParams.get("feature"),assetId=req.nextUrl.searchParams.get("assetId")||undefined;
 if(!workspaceId||!validId(connectionId)||!requested||!expansionFeatures.includes(requested as ExpansionFeature)||assetId&&!/^(?:act_)?[0-9]{2,40}$/.test(assetId))return reply({error:"Invalid account or report selection"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;if(!validGraphVersion(version))return reply({error:"Meta configuration unavailable"},503);
 try{
  const credential=await metaConnectionCredential(workspaceId,connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential)return reply({error:"Connected account not found"},404);
  const env=await resolvedMetaEnv(credential.provider),fb=credential.provider==="facebook_pages";
  const mode:MetaLoginMode=fb?"facebook":instagramUnifiedReady(env)?"instagram_unified":"instagram_direct";
  const feature:ExpansionFeature=requested==="instagram_comments"&&mode==="instagram_direct"?"instagram_direct_comments":requested as ExpansionFeature;
  if(!expansionAllowed(feature,mode))return reply({error:"Report is not available for this provider"},400);
  const prefix=fb?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM",appId=env[prefix+"_CLIENT_ID"]||"",appSecret=env[prefix+"_CLIENT_SECRET"]||"";
  const proof=await inspectMetaToken({provider:credential.provider,accountId:credential.accountId,token:credential.token,appId,appSecret,version});
  if(!proof.verified)return reply({error:"Meta could not verify this account's permissions"},424);
  const missing=META_EXPANSION_SCOPES[feature].filter(s=>!proof.grantedScopes.includes(s));
  if(missing.length)return reply({error:"Missing verified permissions: "+missing.join(", "),missingPermissions:missing},403);
  const snapshot=await fetchMetaExpansion({feature,mode,accountId:credential.accountId,version,token:credential.token,appSecret,grantedPermissions:proof.grantedScopes,assetId});
  return reply({workspaceId,connectionId,snapshot,publishingEnabled:false,readOnly:true});
 }catch{return reply({error:"Meta report unavailable. Verify asset access, account tasks and app permissions. No records were changed."},503);}
}
