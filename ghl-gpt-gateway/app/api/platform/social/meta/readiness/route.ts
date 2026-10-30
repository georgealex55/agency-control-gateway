import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {META_PROVIDERS,metaSetupStatus} from "@/lib/social-meta-contract";
import {stageEnabled} from "@/lib/social-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 const readyForStage=stageEnabled(process.env);
 return reply({workspaceId,connections:META_PROVIDERS.map(id=>{
  const setup=metaSetupStatus(process.env,id,req.nextUrl.origin);
  return {...setup,launchEnabled:readyForStage&&setup.launchEnabled};
 }),publishingEnabled:false,oauthActive:readyForStage&&process.env.SOCIAL_META_CONNECTIONS_ENABLED==="true"});
}
