import {list} from "@vercel/blob";
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
