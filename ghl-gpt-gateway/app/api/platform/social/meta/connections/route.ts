import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {getMetaInventory,selectMetaCandidate,disconnectMeta} from "@/lib/social-meta-connection-store";
import {validId} from "@/lib/social-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 try{return reply({...await getMetaInventory(workspaceId),readOnly:true,publishingEnabled:false});}
 catch{return reply({error:"Connection inventory unavailable"},503);}
}
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 if(process.env.SOCIAL_META_CONNECTIONS_ENABLED!=="true")return reply({error:"Meta connection selection disabled"},423);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const p=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!p||!validId(p.workspaceId)||!validId(p.pendingId)||typeof p.accountId!=="string"||!/^[0-9]{2,40}$/.test(p.accountId))return reply({error:"Valid workspace, pending consent and account required"},400);
 try{
  const connection=await selectMetaCandidate(p.workspaceId,p.pendingId,p.accountId,process.env.SOCIAL_META_TOKEN_KEY||"");
  return connection?reply({connection,readOnly:true,publishingEnabled:false},201):reply({error:"Consent expired, account not selected or already consumed"},409);
 }catch{return reply({error:"Unable to complete connection"},503);}
}
export async function DELETE(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const p=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!p||!validId(p.workspaceId)||!validId(p.connectionId))return reply({error:"Valid workspace and connection ID required"},400);
 try{return await disconnectMeta(p.workspaceId,p.connectionId)?reply({disconnected:true,providerRevocationPending:true,publishingEnabled:false}):reply({error:"Connection not found"},404);}
 catch{return reply({error:"Unable to disconnect"},503);}
}
