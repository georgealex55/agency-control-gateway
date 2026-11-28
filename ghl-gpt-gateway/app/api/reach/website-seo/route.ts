import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {ownerSocialStorageConfigured,socialMetaWorkspaceDb} from "@/lib/reach-social-owner-db";
import {validId} from "@/lib/social-contract";
import {websiteSeo} from "@/lib/reach-web-seo";
import {googleSiteAccess} from "@/lib/reach-google-store";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req),domainId=req.nextUrl.searchParams.get("domainId"),days=Number(req.nextUrl.searchParams.get("days")||"28"),strategy=req.nextUrl.searchParams.get("strategy")||"mobile";
 if(!workspaceId||!ownerSocialStorageConfigured()||workspaceId!==process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID)return reply({error:"Approved owner workspace required"},428);
 if(!validId(domainId)||(days!==7&&days!==28&&days!==90)||(strategy!=="mobile"&&strategy!=="desktop"))return reply({error:"Select a registered domain and supported scan options"},400);
 try{
 const db=await socialMetaWorkspaceDb(workspaceId),rows=await db.query("SELECT hostname FROM public.agency_platform_domains WHERE workspace_id=$1::uuid AND id=$2::uuid LIMIT 1",[workspaceId,domainId]);
 if(!Array.isArray(rows)||rows.length!==1||typeof rows[0].hostname!=="string")return reply({error:"Domain not registered in this workspace"},404);
 const oauth=await googleSiteAccess(workspaceId,rows[0].hostname,"search_console").catch(()=>null);
 return reply({workspaceId,domainId,report:await websiteSeo(rows[0].hostname,days,strategy,process.env,fetch,oauth),readOnly:true});
 }catch{return reply({error:"SEO report unavailable. No site, DNS or hosting changes made."},503);}
}
