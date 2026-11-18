import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {META_PROVIDERS,metaSetupStatus} from "@/lib/social-meta-contract";
import {connectionRuntimeEnabled} from "@/lib/reach-connection-runtime";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 const runtimeReady=connectionRuntimeEnabled();
 return reply({workspaceId,connections:META_PROVIDERS.map(id=>{
  const setup=metaSetupStatus(process.env,id,req.nextUrl.origin);
  return {...setup,launchEnabled:runtimeReady&&setup.launchEnabled};
 }),publishingEnabled:false,oauthActive:runtimeReady&&process.env.SOCIAL_META_CONNECTIONS_ENABLED==="true"});
}
