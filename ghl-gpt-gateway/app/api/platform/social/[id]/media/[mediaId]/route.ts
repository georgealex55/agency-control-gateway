import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {detachPostMedia} from "@/lib/social-post-media-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string;mediaId:string}>}){
 const denied=gate(req,true);if(denied)return denied;
 const {id,mediaId}=await params,workspaceId=workspaceFromQuery(req);
 if(!workspaceId||!validId(id)||!validId(mediaId))return reply({error:"Valid workspace, post and media IDs required"},400);
 try{
  const detached=await detachPostMedia(workspaceId,id,mediaId);
  return detached?reply({detached:true,assetDeleted:false,published:false}):reply({error:"Attachment not found for this workspace"},404);
 }catch{return reply({error:"Cannot unlink media"},503);}
}
