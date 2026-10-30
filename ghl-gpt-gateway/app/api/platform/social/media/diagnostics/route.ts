import {list,put,get,del} from "@vercel/blob";
import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {mediaStorageStatus} from "@/lib/social-media-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 if(!workspaceFromQuery(req))return reply({error:"Valid workspace ID required"},400);
 const storage=mediaStorageStatus(process.env);
 // A configured environment variable alone is not proof of store connectivity.
 if(!storage.readAllowed)return reply({
  storeCreated:true,storeConnected:false,checkedLive:false,uploadsEnabled:false,
  status:storage.reason,mode:storage.mode,private:true
 });
 try{
  await list({prefix:"social-staging/",limit:1});
  return reply({storeCreated:true,storeConnected:true,checkedLive:true,uploadsEnabled:storage.uploadAllowed,
   status:"verified_read_access",mode:storage.mode,private:true});
 }catch{
  return reply({storeCreated:true,storeConnected:false,checkedLive:true,uploadsEnabled:false,
   status:"blob_auth_or_store_failure",mode:storage.mode,private:true},503);
 }
}

/** Explicit admin-only synthetic PRIVATE upload -> authenticated read -> delete. Never creates user media. */
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 if(!workspaceFromQuery(req))return reply({error:"Valid workspace ID required"},400);
 const storage=mediaStorageStatus(process.env);
 if(!storage.uploadAllowed)return reply({error:"Staging private Blob uploads are disabled or unlinked",roundTripVerified:false},403);
 const path="social-staging/diagnostics/"+randomUUID()+".png";
 // Known 1px image; no user content, credentials, or public URL in this diagnostic.
 const original=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMncAAAAASUVORK5CYII=","base64");
 const blob=new File([original],"diagnostic.png",{type:"image/png"});
 let savedPath:string|null=null,verified=false,deleted=false;
 try{
  const stored=await put(path,blob,{access:"private",contentType:"image/png",addRandomSuffix:false});
  savedPath=stored.pathname;
  const received=await get(stored.pathname,{access:"private"});
  if(received?.statusCode===200&&received.stream){
   const bytes=Buffer.from(await new Response(received.stream).arrayBuffer());
   verified=bytes.equals(original);
  }
 }catch{
  // The response is intentionally generic. Never surface Blob credentials or URLs.
 }finally{
  if(savedPath){
   try{await del(savedPath);deleted=true;}catch{}
  }
 }
 const success=verified&&deleted;
 return reply({roundTripVerified:success,private:true,uploadSucceeded:!!savedPath,
  downloadMatched:verified,temporaryBlobDeleted:deleted,externalPublishing:false,
  note:success?"Private synthetic file uploaded, read byte-for-byte and deleted.":"Private round-trip was not fully verified. Review Blob access or cleanup."},success?200:503);
}
