import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated} from "@/lib/portal-auth";
import {commandLayoutStage,commandApprovedStorageConfigured,commandLayoutWritesEnabled} from "@/lib/reach-command-layout-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
/** No database query or connection information is returned by this preflight. */
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!commandLayoutStage())return reply({error:"Command Center is limited to the isolated staging preview"},403);
 if(!commandApprovedStorageConfigured())return reply({error:"Isolated staging database has not been verified or approved"},428);
 return reply({isolatedStorageApproved:true,layoutWritesEnabled:commandLayoutWritesEnabled()});
}
