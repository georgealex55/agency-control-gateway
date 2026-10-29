import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {postizStageConfigured,readPostizStage} from "@/lib/social-postiz";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Workspace ID required"},400);
 if(!postizStageConfigured(process.env))return reply({configured:false,channels:[],analytics:null,publishingEnabled:false,requiresStagingService:true});
 const analyticsId=req.nextUrl.searchParams.get("analytics");
 if(analyticsId&&(!/^[A-Za-z0-9_-]{1,100}$/.test(analyticsId)))return reply({error:"Invalid channel ID"},400);
 try{return reply(await readPostizStage(workspaceId,analyticsId||undefined));}
 catch{return reply({error:"Staging Postiz credentials, organization or service unavailable"},502);}
}
