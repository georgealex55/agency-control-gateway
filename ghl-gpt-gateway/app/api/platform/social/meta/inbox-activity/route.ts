import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {inspectMetaToken} from "@/lib/social-meta-capabilities";
import {validGraphVersion} from "@/lib/social-meta-contract";
import {FACEBOOK_INBOX_READ_SCOPES,fetchFacebookInboxActivity} from "@/lib/social-meta-analytics";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=40;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),connectionId=req.nextUrl.searchParams.get("connectionId");
 if(!workspaceId||!validId(connectionId))return reply({error:"Select a connected Facebook Page"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;
 if(!validGraphVersion(version))return reply({error:"Meta inbox configuration unavailable"},503);
 try{
  const credential=await metaConnectionCredential(workspaceId,connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential||credential.provider!=="facebook_pages")return reply({error:"Connected Facebook Page not found"},404);
  const env=await resolvedMetaEnv(credential.provider);
  const appId=env.SOCIAL_META_FACEBOOK_CLIENT_ID||"",appSecret=env.SOCIAL_META_FACEBOOK_CLIENT_SECRET||"";
  const proof=await inspectMetaToken({provider:credential.provider,accountId:credential.accountId,token:credential.token,appId,appSecret,version});
  if(!proof.verified)return reply({error:"Meta could not verify this account's permissions"},424);
  const missing=FACEBOOK_INBOX_READ_SCOPES.filter(scope=>!proof.grantedScopes.includes(scope));
  if(missing.length)return reply({error:"Missing Messenger permissions: "+missing.join(", "),missingPermissions:missing},403);
  const snapshot=await fetchFacebookInboxActivity({accountId:credential.accountId,token:credential.token,appSecret,version,grantedPermissions:proof.grantedScopes});
  return reply({workspaceId,connectionId,snapshot,readOnly:true,publishingEnabled:false});
 }catch{return reply({error:"Meta inbox activity unavailable. Verify the Page messaging task and app access."},503);}
}
