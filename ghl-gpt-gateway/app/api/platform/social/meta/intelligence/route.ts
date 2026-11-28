import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential} from "@/lib/social-meta-connection-store";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {instagramUnifiedReady} from "@/lib/social-meta-instagram-unified";
import {inspectMetaToken,type MetaLoginMode} from "@/lib/social-meta-capabilities";
import {scanMetaExtras} from "@/lib/social-meta-analytics";
import {validGraphVersion} from "@/lib/social-meta-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),connectionId=req.nextUrl.searchParams.get("connectionId");
 if(!workspaceId||!validId(connectionId))return reply({error:"Select a connected Meta account"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;if(!validGraphVersion(version))return reply({error:"Meta configuration unavailable"},503);
 try{
  const credential=await metaConnectionCredential(workspaceId,connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential)return reply({error:"Connection unavailable"},404);
  const env=await resolvedMetaEnv(credential.provider),fb=credential.provider==="facebook_pages";
  const mode:MetaLoginMode=fb?"facebook":instagramUnifiedReady(env)?"instagram_unified":"instagram_direct";
  const prefix=fb?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
  const appId=env[prefix+"_CLIENT_ID"]||"",appSecret=env[prefix+"_CLIENT_SECRET"]||"";
  const proof=await inspectMetaToken({provider:credential.provider,token:credential.token,accountId:credential.accountId,appId,appSecret,version});
  if(!proof.verified)return reply({error:"Meta permission verification unavailable",permissionCheck:proof.reason},424);
  const scan=await scanMetaExtras({mode,accountId:credential.accountId,version,token:credential.token,appSecret,grantedPermissions:proof.grantedScopes});
  return reply({workspaceId,connectionId,source:"meta_graph_api",readOnly:true,publishingEnabled:false,checkedAt:new Date().toISOString(),grantedPermissions:proof.grantedScopes,...scan});
 }catch{return reply({error:"Meta intelligence scan unavailable"},503);}
}
