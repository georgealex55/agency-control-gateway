import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {providerReadiness} from "@/lib/social-provider-catalog";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Workspace ID required"},400);
 // No per-workspace credentials exist in staging; these are integration requirements, not connected accounts.
 return reply({workspaceId,connections:providerReadiness(),authEnabled:false,publishingEnabled:false,realMetricsAvailable:false});
}
