import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {META_PROVIDERS,META_READ_PERMISSIONS,metaConfigured} from "@/lib/social-meta-contract";
import {stageEnabled} from "@/lib/social-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 return reply({workspaceId,connections:META_PROVIDERS.map(id=>({provider:id,appConfigured:metaConfigured(process.env,id),permissions:[...META_READ_PERMISSIONS[id]],accessType:"read_only",launchEnabled:stageEnabled(process.env)&&process.env.SOCIAL_META_CONNECTIONS_ENABLED==="true"&&metaConfigured(process.env,id)})),publishingEnabled:false,oauthActive:process.env.SOCIAL_META_CONNECTIONS_ENABLED==="true"});
}
