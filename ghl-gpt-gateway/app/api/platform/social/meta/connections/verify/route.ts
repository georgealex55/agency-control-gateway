import {NextRequest} from "next/server";
import {gate,reply} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {metaConnectionCredential,markMetaVerified} from "@/lib/social-meta-connection-store";
import {listFacebookPages} from "@/lib/social-meta-pages";
import {readInstagramProfessionalProfile} from "@/lib/social-meta-instagram";
import {validGraphVersion} from "@/lib/social-meta-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 if(process.env.SOCIAL_META_CONNECTIONS_ENABLED!=="true")return reply({error:"Meta account checks disabled"},423);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const o=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!o||!validId(o.workspaceId)||!validId(o.connectionId))return reply({error:"Valid workspace and connection required"},400);
 const version=process.env.SOCIAL_META_GRAPH_VERSION;
 if(!validGraphVersion(version))return reply({error:"Meta Graph API not configured"},503);
 try{
  const credential=await metaConnectionCredential(o.workspaceId,o.connectionId,process.env.SOCIAL_META_TOKEN_KEY||"");
  if(!credential)return reply({error:"Connection not found"},404);
  const verified=credential.provider==="facebook_pages"?
   (await listFacebookPages({token:credential.token,version})).some(p=>p.id===credential.accountId):
   (await readInstagramProfessionalProfile({token:credential.token,version})).id===credential.accountId;
  if(!verified)return reply({error:"The selected account is no longer available; reconnect this provider"},409);
  await markMetaVerified(o.workspaceId,o.connectionId);
  return reply({verified:true,provider:credential.provider,readOnly:true,publishingEnabled:false});
 }catch{
  return reply({error:"Meta account could not be verified. The token may have expired or permission may have been revoked."},503);
 }
}
