import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {instagramUnifiedReady} from "@/lib/social-meta-instagram-unified";
import {inspectMetaToken,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {validGraphVersion} from "@/lib/social-meta-contract";
import {fetchMetaInbox,inboxReadScopes,validInboxObject} from "@/lib/social-meta-analytics";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),connectionId=req.nextUrl.searchParams.get("connectionId"),channel=req.nextUrl.searchParams.get("channel"),parentId=req.nextUrl.searchParams.get("parentId");
 if(!workspaceId||!validId(connectionId)||(channel!=="messages"&&channel!=="comments")||(parentId!==null&&!validInboxObject(parentId)))return reply({error:"Invalid inbox selection"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;if(!validGraphVersion(version))return reply({error:"Meta configuration unavailable"},503);
 try{
  const credential=await metaConnectionCredential(workspaceId,connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential)return reply({error:"Connection unavailable"},404);
  const env=await resolvedMetaEnv(credential.provider),fb=credential.provider==="facebook_pages";
  const mode:MetaLoginMode=fb?"facebook":instagramUnifiedReady(env)?"instagram_unified":"instagram_direct";
  const prefix=fb?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM",appId=env[prefix+"_CLIENT_ID"]||"",appSecret=env[prefix+"_CLIENT_SECRET"]||"";
  const proof=await inspectMetaToken({provider:credential.provider,accountId:credential.accountId,token:credential.token,appId,appSecret,version});
  if(!proof.verified)return reply({error:"Meta permissions could not be verified"},424);
  const missing=inboxReadScopes(mode,channel).filter(s=>!proof.grantedScopes.includes(s));
  if(missing.length)return reply({error:"Missing verified permissions: "+missing.join(", "),missingPermissions:missing},403);
  const snapshot=await fetchMetaInbox({mode,accountId:credential.accountId,version,token:credential.token,appSecret,grantedPermissions:proof.grantedScopes,channel,parentId:parentId||undefined});
  return reply({workspaceId,connectionId,channel,parentId,snapshot,readOnly:true,publishingEnabled:false});
 }catch{return reply({error:"Meta could not return this inbox report. Check account access, Page tasks or comment permissions. No records changed."},503);}
}
