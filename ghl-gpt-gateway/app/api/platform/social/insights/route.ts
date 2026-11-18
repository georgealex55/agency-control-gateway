import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {socialInsights} from "@/lib/social-insights";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 try{return reply(await socialInsights(workspaceId));}catch{return reply({error:"Internal social insights unavailable"},503);}
}
