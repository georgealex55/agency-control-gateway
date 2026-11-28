import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {ownerSocialStorageConfigured,socialMetaWorkspaceDb} from "@/lib/reach-social-owner-db";
import {validId} from "@/lib/social-contract";
import {websiteAnalytics} from "@/lib/reach-web-analytics";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),domainId=req.nextUrl.searchParams.get("domainId"),days=Number(req.nextUrl.searchParams.get("days")||"28");
 if(!workspaceId||!ownerSocialStorageConfigured()||workspaceId!==process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID)return reply({error:"Approved owner workspace required"},428);
 if(!validId(domainId)||(days!==7&&days!==28&&days!==90))return reply({error:"Select a registered domain and supported period"},400);
 try{
 const db=await socialMetaWorkspaceDb(workspaceId),rows=await db.query("SELECT hostname FROM public.agency_platform_domains WHERE workspace_id=$1::uuid AND id=$2::uuid LIMIT 1",[workspaceId,domainId]);
 if(!Array.isArray(rows)||rows.length!==1||typeof rows[0].hostname!=="string")return reply({error:"Domain not registered in this workspace"},404);
 const report=await websiteAnalytics(rows[0].hostname,days);
 return reply({workspaceId,domainId,report,readOnly:true});
 }catch{return reply({error:"Website analytics unavailable. No site or DNS changes made."},503);}
}
