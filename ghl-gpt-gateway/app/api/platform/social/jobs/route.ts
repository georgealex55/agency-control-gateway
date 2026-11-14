import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {listDeliveryJobs} from "@/lib/social-native-queue";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Workspace ID required"},400);
 try{return reply({jobs:await listDeliveryJobs(workspaceId),externalPublishing:false});}
 catch{return reply({error:"Unable to read delivery simulations"},503);}
}
