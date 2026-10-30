import {get} from "@vercel/blob";
import {NextRequest,NextResponse} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {mediaRecord} from "@/lib/social-media-store";
import {mediaStorageStatus} from "@/lib/social-media-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const denied=gate(req);if(denied)return denied;
 const {id}=await params,workspaceId=workspaceFromQuery(req);
 if(!validId(id)||!workspaceId)return reply({error:"Invalid media or workspace"},400);
 if(!mediaStorageStatus(process.env).readAllowed)return reply({error:"Private staging Blob storage is not connected"},503);
 try{
  const file=await mediaRecord(workspaceId,id);
  if(!file)return reply({error:"Media not found"},404);
  const response=await get(file.blobPath,{access:"private"});
  if(!response||response.statusCode!==200)return reply({error:"Media not found"},404);
  return new NextResponse(response.stream,{headers:{"Content-Type":file.mime,"Content-Disposition":"inline","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"}});
 }catch{return reply({error:"Private media is temporarily unavailable"},503);}
}
