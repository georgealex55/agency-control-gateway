import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {UPSTREAM_ENGINES,engineSetup} from "@/lib/upstream-engine-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Valid platform workspace required"},400);
 return reply({singleAdmin:true,externalWritesEnabled:false,engines:UPSTREAM_ENGINES.map(engine=>engineSetup(process.env,engine,workspaceId))});
}
