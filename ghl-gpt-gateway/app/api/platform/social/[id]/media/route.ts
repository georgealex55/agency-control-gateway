import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {listPostMedia,attachPostMedia} from "@/lib/social-post-media-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const denied=gate(req);if(denied)return denied;
 const {id}=await params,workspaceId=workspaceFromQuery(req);
 if(!workspaceId||!validId(id))return reply({error:"Valid workspace and post ID required"},400);
 try{return reply({media:await listPostMedia(workspaceId,id),externalPublishing:false});}
 catch{return reply({error:"Post attachments unavailable"},503);}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const denied=gate(req,true);if(denied)return denied;
 const {id}=await params;if(!validId(id))return reply({error:"Valid post ID required"},400);
 let value:unknown;try{value=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const body=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
 if(!body||!validId(body.workspaceId)||!validId(body.mediaId))return reply({error:"Valid workspace and media ID required"},400);
 try{
  const attached=await attachPostMedia(body.workspaceId,id,body.mediaId);
  return attached?reply({attached:true,published:false},201):reply({error:"Media not found in this workspace, already linked, or 10-file limit reached"},409);
 }catch{return reply({error:"Cannot link media"},503);}
}
