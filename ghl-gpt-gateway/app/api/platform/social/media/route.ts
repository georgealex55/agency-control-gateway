import {put,del} from "@vercel/blob";
import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {MEDIA_MAX_BYTES,validMime,validMediaBytes,mediaSuffix,uploadAllowed,mediaStorageStatus} from "@/lib/social-media-contract";
import {listMedia,createMedia,newMediaId,mediaWorkspaceExists} from "@/lib/social-media-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 try{const storage=mediaStorageStatus(process.env);return reply({media:await listMedia(workspaceId),uploadsEnabled:storage.uploadAllowed,storageConnected:storage.configured,storageMode:storage.mode,storageStatus:storage.reason,private:true});}
 catch{return reply({error:"Media library unavailable"},503);}
}
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 if(!uploadAllowed(process.env))return reply({error:"Private staging Blob storage is not configured"},503);
 const type=req.headers.get("content-type")||"";
 if(!type.startsWith("multipart/form-data;"))return reply({error:"Expected multipart form data"},415);
 const len=Number(req.headers.get("content-length")||"0");
 if(len>MEDIA_MAX_BYTES+16384)return reply({error:"Media payload too large"},413);
 let form:FormData;
 try{form=await req.formData();}catch{return reply({error:"Invalid media form"},400);}
 const workspaceId=form.get("workspaceId");
 if(!validId(workspaceId))return reply({error:"Workspace ID required"},400);
 const file=form.get("file");
 if(!(file instanceof File)||!validMime(file.type)||file.size<12||file.size>MEDIA_MAX_BYTES)return reply({error:"Use a JPEG, PNG or WebP image under 4 MB"},400);
 const data=new Uint8Array(await file.arrayBuffer());
 if(!validMediaBytes(data,file.type))return reply({error:"File contents do not match the declared image format"},400);
 const name=file.name.slice(0,140).replace(/[\u0000-\u001F\u007F]/g," ").trim()||"upload";
 try{if(!await mediaWorkspaceExists(workspaceId))return reply({error:"Workspace not found"},404);}
 catch{return reply({error:"Workspace lookup unavailable"},503);}
 const id=newMediaId();
 const path="social-staging/"+workspaceId+"/"+id+"."+mediaSuffix(file.type);
 let stored=false;
 try{
   const result=await put(path,file,{access:"private",contentType:file.type,addRandomSuffix:false});
   stored=true;
   const item=await createMedia({id,workspaceId,name,mime:file.type,size:data.byteLength,blobPath:result.pathname});
   if(!item){await del(result.pathname).catch(()=>{});return reply({error:"Workspace not found"},404);}
   return reply({media:item,private:true,published:false},201);
 }catch{
   if(stored)await del(path).catch(()=>{});
   return reply({error:"Private upload failed; no media was published"},503);
 }
}
